/**
 * Websites on the user's own Orgo computer. Server only.
 *
 * - A site is a folder `/root/sites/<slug>` (a git repo) the agent builds under the contract in `contract.ts`.
 * - Preview: the agent's dev server on the site's dev port, exposed as an Orgo app URL with `link` access
 *   (the only mode another origin may frame).
 * - Publish: a production copy in `.openman/release`, served on the site's prod port by the site kit
 *   (`kit-files.ts`: a static server, or the full-stack template's own `server.mjs`), which also logs page views
 *   and runs the site's scheduled jobs. Orgo keeps that command running through reboots (a computer service made by
 *   `POST /apps` with `command`), and the port gets its own app URL whose access follows the site's visibility.
 * - Secrets: sealed in our database, written to `<folder>/.env` (mode 600, never published or committed) when the
 *   site starts or a secret changes; the kit re-reads it on change.
 * - Versions: git commits in the folder, with a headless-Chrome screenshot per checkpoint.
 */
import { consumeUsage, UsageLimitError } from "@/lib/usage";
import { brand } from "@/config/brand";
import type { CreateTaskInput } from "@/lib/agent/types";
import { createRuntime } from "@/lib/agent/server/relay";
import { deriveTitle, newTaskId } from "@/lib/agent/server/tasks";
import { getAccount } from "@/lib/db/accounts";
import { listKnowledge } from "@/lib/db/knowledge";
import {
  deleteWebsiteRow,
  getWebsiteRow,
  insertWebsiteRow,
  toWebsite,
  updateWebsiteRow,
  usedPorts,
  type WebsiteMeta,
  type WebsiteRow,
} from "@/lib/db/websites";
import { open as unseal } from "@/lib/crypto";
import { sealedWebsiteSecrets } from "@/lib/db/websites";
import { readAndRemove, stageSecretFile } from "@/lib/orgo/secret-file";
import { orgoFor, type OrgoClient, type Session } from "@/lib/session";
import { OrgoError } from "@/lib/orgo/user-client";
import { toSummary, type Store, type TaskRecord, type TaskView } from "@/lib/store";
import { KIT_DIR, MARKER, NEEDS_SECRETS, nameFromPrompt, siteFolder, siteInstructions, SITES_ROOT, slugify, TEMPLATES, type SiteMarker } from "./contract";
import { KIT_FILES, KIT_VERSION } from "./kit-files";
import type { PreviewState, SecretRequest, SiteCheckpoint, SiteTemplate, SiteVisibility, Website } from "./types";

/* ---------------------------------------------------------------- basics */

export class SiteError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const DEV_PORTS = [4100, 4199] as const;
const PROD_PORTS = [4300, 4399] as const;
const ACCESS: Record<SiteVisibility, "link" | "people" | "team"> = { public: "link", invite: "people", private: "team" };
const GIT = "git -c user.name=Agent -c user.email=agent@openman.local";

export const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;

/** The computer the user's agent works on: their home computer, or the env one for the dev user. */
export async function computerIdFor(session: Session): Promise<string> {
  if (!session.dev) {
    const account = await getAccount(session.userId).catch(() => null);
    if (account?.homeComputerId) return account.homeComputerId;
  }
  const env = process.env.ORGO_COMPUTER_ID?.trim();
  if (session.dev && env) return env;
  throw new SiteError("Your agent computer isn't set up yet. Open Computers to create it, then try again.", 409);
}

export interface Ctx {
  client: OrgoClient;
  computerId: string;
  userId: string;
}

export async function ctxFor(session: Session, row?: WebsiteRow | null): Promise<Ctx> {
  const client = await orgoFor(session);
  const computerId = row?.computer_id || (await computerIdFor(session));
  return { client, computerId, userId: session.userId };
}

/** Runs bash on the computer. Throws `SiteError` 503 "paused" when the computer is not running. */
export async function sh(ctx: Ctx, command: string, timeout = 60): Promise<{ out: string; code: number }> {
  try {
    const r = await ctx.client.bash(ctx.computerId, command, timeout);
    return { out: r.output ?? "", code: r.exit_code ?? (r.success ? 0 : 1) };
  } catch (err) {
    if (err instanceof OrgoError && (err.status === 409 || err.status === 503 || /not running|stopped|suspended|asleep/i.test(err.message))) {
      throw new SiteError("The computer is asleep.", 503);
    }
    throw err;
  }
}

/** Whether the computer is running (false when stopped, suspended or starting). */
async function computerRunning(ctx: Ctx): Promise<boolean> {
  try {
    const c = await ctx.client.getComputer(ctx.computerId);
    return (c.status ?? "running") === "running";
  } catch {
    return false;
  }
}

function sections(out: string): Record<string, string> {
  const map: Record<string, string> = {};
  const parts = out.split(/^@@([A-Z]+)$/m);
  for (let i = 1; i < parts.length; i += 2) map[parts[i]] = (parts[i + 1] ?? "").trim();
  return map;
}

export function patchMeta(row: WebsiteRow, patch: WebsiteMeta): WebsiteMeta {
  return { ...(row.meta ?? {}), ...patch };
}

export async function save(ctx: Ctx, row: WebsiteRow, patch: Partial<WebsiteRow>): Promise<WebsiteRow> {
  return (await updateWebsiteRow(ctx.userId, row.id, patch)) ?? { ...row, ...patch };
}

/* ---------------------------------------------------------------- site kit, env file, schedules */

const kitOn = new Map<string, string>();

/** Installs (or updates) the site kit at /root/.openman/site-kit. The files travel through Orgo's file transfer. */
export async function ensureKit(ctx: Ctx): Promise<void> {
  if (kitOn.get(ctx.computerId) === KIT_VERSION) return;
  const have = await sh(ctx, `cat ${KIT_DIR}/VERSION 2>/dev/null`, 20);
  if (have.out.trim() !== KIT_VERSION) {
    const staged = await stageSecretFile(ctx.client, ctx.computerId, JSON.stringify({ files: KIT_FILES, version: KIT_VERSION }));
    const py = [
      readAndRemove(staged, "kit"),
      "import os",
      `root = ${JSON.stringify(KIT_DIR)}`,
      "for rel, body in kit['files'].items():",
      "    dest = os.path.normpath(os.path.join(root, rel))",
      "    if not dest.startswith(root + '/'): continue",
      "    os.makedirs(os.path.dirname(dest), exist_ok=True)",
      "    open(dest, 'w', encoding='utf-8').write(body)",
      "open(os.path.join(root, 'VERSION'), 'w').write(kit['version'])",
      "print('KIT_OK')",
    ].join("\n");
    const r = await sh(ctx, `python3 -c ${q(py)}`, 60);
    if (!r.out.includes("KIT_OK")) throw new SiteError("The site kit could not be installed on your computer.", 502);
  }
  kitOn.set(ctx.computerId, KIT_VERSION);
}

/** Writes `<folder>/.env` from the site's sealed secrets (plus the AI switch). Values travel as a staged file, never in a command. */
export async function writeSiteEnv(ctx: Ctx, row: WebsiteRow): Promise<void> {
  if (!isSiteFolder(row.folder)) return;
  const vars: Record<string, string> = {};
  for (const s of await sealedWebsiteSecrets(ctx.userId, row.id)) vars[s.name] = unseal(s.valueEnc);
  if (row.meta?.aiEnabled) vars.OM_AI_ENABLED = "1";
  const staged = await stageSecretFile(ctx.client, ctx.computerId, JSON.stringify({ vars }));
  const py = [
    readAndRemove(staged, "env"),
    "import json, os, sys",
    `site = os.path.realpath(${JSON.stringify(row.folder)})`,
    "if os.path.dirname(site) != os.path.realpath('/root/sites') or not os.path.isdir(site): print('NO_SITE'); sys.exit(0)",
    "path = os.path.join(site, '.env')",
    "tmp = path + '.tmp'",
    "fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)",
    "with os.fdopen(fd, 'w', encoding='utf-8') as f:",
    "    f.write('# Written by the app from the site\\'s Secrets. Never publish or commit this file.\\n')",
    "    for k, v in sorted(env['vars'].items()): f.write(k + '=' + json.dumps(v) + '\\n')",
    "os.replace(tmp, path)",
    "gi = os.path.join(site, '.gitignore')",
    "lines = open(gi).read().split('\\n') if os.path.exists(gi) else []",
    "if '.env' not in lines: open(gi, 'a').write(('\\n' if lines and lines[-1] else '') + '.env\\n')",
    "print('ENV_OK')",
  ].join("\n");
  const r = await sh(ctx, `python3 -c ${q(py)}`, 40);
  if (!r.out.includes("ENV_OK") && !r.out.includes("NO_SITE")) throw new SiteError("The site's secrets could not be written to your computer.", 502);
  if (row.meta?.envDirty) await updateWebsiteRow(ctx.userId, row.id, { meta: patchMeta(row, { envDirty: false }) }).catch(() => undefined);
}

/** Mirrors the site's scheduled jobs to `.openman/schedules.json`, read every minute by the published site's runtime. */
export async function writeSchedules(ctx: Ctx, row: WebsiteRow): Promise<void> {
  if (!isSiteFolder(row.folder)) return;
  const jobs = (row.meta?.schedules ?? []).map((j) => ({ id: j.id, name: j.name, cron: j.cron, command: j.command, enabled: j.enabled }));
  const b64 = Buffer.from(JSON.stringify(jobs)).toString("base64");
  await sh(ctx, `mkdir -p ${q(row.folder)}/.openman && echo ${q(b64)} | base64 -d > ${q(row.folder)}/.openman/schedules.json.tmp && mv ${q(row.folder)}/.openman/schedules.json.tmp ${q(row.folder)}/.openman/schedules.json && echo OK`, 20);
}

/* ---------------------------------------------------------------- Orgo URLs */

async function findUrlOnPort(ctx: Ctx, port: number) {
  const list = await ctx.client.publicUrls(ctx.computerId);
  return list.public_urls.find((u) => u.port === port) ?? null;
}

/** Makes (or reuses) the app URL on `port` and sets its access. */
async function ensureUrl(ctx: Ctx, port: number, name: string, access: "link" | "people" | "team") {
  let url = await findUrlOnPort(ctx, port);
  if (!url) url = await ctx.client.createPublicUrl(ctx.computerId, { port, name: slugify(name) });
  if (url.access !== access) url = { ...url, ...(await ctx.client.updatePublicUrl(ctx.computerId, url.id, { access })) };
  return url;
}

async function removeUrl(ctx: Ctx, urlId: string | null | undefined, port: number | null) {
  let id = urlId ?? null;
  if (!id && port) id = (await findUrlOnPort(ctx, port).catch(() => null))?.id ?? null;
  if (!id) return;
  await ctx.client.request("DELETE", `/computers/${encodeURIComponent(ctx.computerId)}/public-urls/${encodeURIComponent(id)}`).catch((err) => {
    if (!(err instanceof OrgoError && err.status === 404)) throw err;
  });
}

async function removeServiceOnPort(ctx: Ctx, port: number) {
  const list = await ctx.client
    .request<{ services?: { id: string; port?: number | null }[] }>("GET", `/computers/${encodeURIComponent(ctx.computerId)}/services?live=0`)
    .catch(() => ({ services: [] as { id: string; port?: number | null }[] }));
  for (const s of list.services ?? []) {
    if (s.port === port) await ctx.client.request("DELETE", `/computers/${encodeURIComponent(ctx.computerId)}/services/${encodeURIComponent(s.id)}`).catch(() => undefined);
  }
}

/** Kills whatever listens on `port` (only the listening processes, never their process group). */
const killPort = (port: number) =>
  `for p in $(ss -ltnpH "sport = :${port}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$p" 2>/dev/null; done; true`;

const waitPort = (port: number, seconds: number) =>
  `for i in $(seq 1 ${seconds * 2}); do curl -s -o /dev/null -m 2 http://127.0.0.1:${port}/ && break; sleep 0.5; done; curl -s -o /dev/null -m 3 -w '%{http_code}' http://127.0.0.1:${port}/ || echo 000`;

/* ---------------------------------------------------------------- create */

function pickPort(range: readonly [number, number], used: Set<number>, listening: Set<number>): number {
  for (let p = range[0]; p <= range[1]; p++) if (!used.has(p) && !listening.has(p)) return p;
  throw new SiteError("No free port left for another site on this computer. Delete a site first.", 409);
}

async function listeningPorts(ctx: Ctx): Promise<Set<number>> {
  const r = await sh(ctx, "ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -un", 20).catch(() => ({ out: "", code: 1 }));
  return new Set(r.out.split(/\s+/).map(Number).filter((n) => n > 0));
}

async function freeSlug(ctx: Ctx, base: string): Promise<string> {
  const r = await sh(ctx, `ls -1 /root/sites 2>/dev/null`, 20).catch(() => ({ out: "", code: 1 }));
  const taken = new Set(r.out.split(/\s+/).filter(Boolean));
  const root = slugify(base, 12);
  if (!taken.has(root)) return root;
  for (let i = 2; i < 100; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36).slice(-4)}`;
}

/** Folder and a git repo with identity and ignores. The agent writes the marker itself. */
async function prepareFolder(ctx: Ctx, folder: string) {
  await ensureKit(ctx);
  const r = await sh(
    ctx,
    [
      `mkdir -p ${q(folder)}/.openman && cd ${q(folder)}`,
      `[ -d .git ] || git init -q`,
      `git config user.name Agent && git config user.email agent@openman.local`,
      `[ -f .gitignore ] || printf 'node_modules/\\ndist/\\n.openman/\\n.env\\n' > .gitignore`,
      `grep -qx '.env' .gitignore || echo '.env' >> .gitignore`,
      `git rev-parse -q --verify HEAD >/dev/null || { git add -A && ${GIT} commit -qm "Start" ; }`,
      `echo OK`,
    ].join(" && "),
    40,
  );
  if (!r.out.includes("OK")) throw new SiteError(`The site folder could not be prepared: ${r.out.slice(-200)}`, 502);
}

async function knowledgeText(userId: string): Promise<string> {
  const knowledge = await listKnowledge(userId, { enabledOnly: true }).catch(() => []);
  if (!knowledge.length) return "";
  return (
    "\n\nKnowledge the user saved. Apply an entry only when its condition fits the task:\n" +
    knowledge.map((k) => `- ${k.name}${k.whenToUse ? ` (use when: ${k.whenToUse})` : ""}: ${k.content}`).join("\n")
  );
}

/** Same as `createTask` (src/lib/agent/server/tasks.ts), with the site contract as the run instructions. */
async function startSiteTask(store: Store, input: CreateTaskInput, instructions: string): Promise<TaskView> {
  const now = new Date().toISOString();
  const id = newTaskId();
  const task: TaskRecord = {
    id,
    title: deriveTitle(input.prompt),
    status: "waking",
    createdAt: now,
    updatedAt: now,
    projectId: null,
    favorite: false,
    archived: false,
    meta: {
      instructions,
      mode: input.mode,
      effort: input.effort,
      speed: input.speed,
      target: input.target,
      connectors: input.connectors,
      sessionId: `openman-${id}`,
      runId: null,
      queue: [],
    },
  };
  const runtime = createRuntime(store, task);
  try {
    await store.createTask(task);
  } catch (err) {
    runtime.discard();
    throw err;
  }
  const prompt = input.attachments?.length ? `${input.prompt}\n\nAttached files:\n${input.attachments.map((a) => `- ${a.name}: ${a.url}`).join("\n")}` : input.prompt;
  runtime.begin(prompt, input.prompt);
  return toSummary(runtime.task);
}

/** "Build a website": prepares the folder, starts the agent with the contract, stores the site. */
export async function createWebsite(store: Store, session: Session, input: CreateTaskInput & { name?: string }): Promise<{ site: Website; task: TaskView }> {
  if (store.kind !== "supabase") throw new SiteError("Websites need the database.", 503);
  const ctx = await ctxFor(session);
  if (!(await computerRunning(ctx))) await ctx.client.startComputer(ctx.computerId).catch(() => undefined);
  const name = (input.name?.trim() || nameFromPrompt(input.prompt)).slice(0, 80);
  const [used, listening] = await Promise.all([usedPorts(ctx.userId, ctx.computerId), listeningPorts(ctx)]);
  const devPort = pickPort(DEV_PORTS, used, listening);
  const prodPort = pickPort(PROD_PORTS, used, listening);
  const slug = await freeSlug(ctx, name);
  const folder = siteFolder(slug);
  await prepareFolder(ctx, folder);
  const instructions = siteInstructions({ name, folder, devPort }) + (await knowledgeText(ctx.userId));
  const task = await startSiteTask(store, input, instructions);
  const row = await insertWebsiteRow(ctx.userId, {
    id: crypto.randomUUID(),
    name,
    slug: `${slug}-${crypto.randomUUID().slice(0, 6)}`,
    task_id: task.id,
    computer_id: ctx.computerId,
    folder,
    dev_port: devPort,
    prod_port: prodPort,
    status: "building",
    visibility: "public",
    meta: { taskIds: [task.id] },
  });
  return { site: toWebsite(row), task };
}

/** "Edit in new task": a fresh task on the same folder and contract. */
export async function editInNewTask(store: Store, session: Session, row: WebsiteRow, input: CreateTaskInput): Promise<TaskView> {
  if (!row.folder || !row.dev_port) throw new SiteError("This site has no folder yet.", 409);
  await ensureKit(await ctxFor(session, row)).catch(() => undefined);
  const instructions = siteInstructions({ name: row.name, folder: row.folder, devPort: row.dev_port }) + (await knowledgeText(session.userId));
  const prompt = `${input.prompt}\n\n(This continues the existing website "${row.name}" in ${row.folder}; its current files are there.)`;
  const task = await startSiteTask(store, { ...input, prompt }, instructions);
  const taskIds = [...(row.meta?.taskIds ?? (row.task_id ? [row.task_id] : [])), task.id];
  await updateWebsiteRow(session.userId, row.id, { meta: patchMeta(row, { taskIds }) });
  return task;
}

/* ---------------------------------------------------------------- sync and preview */

interface Probe {
  marker: SiteMarker | null;
  needs: SecretRequest[];
  live: boolean;
  dirty: boolean;
  head: string | null;
}

async function probe(ctx: Ctx, row: WebsiteRow): Promise<Probe | null> {
  if (!row.folder) return null;
  const port = row.dev_port ?? 0;
  const r = await sh(
    ctx,
    `cd ${q(row.folder)} 2>/dev/null || { echo @@GONE; exit 0; }; echo @@M; cat ${MARKER} 2>/dev/null; echo; echo @@L; curl -s -o /dev/null -m 3 -w '%{http_code}' http://127.0.0.1:${port}/ || true; echo; echo @@D; git status --porcelain 2>/dev/null | head -1 | wc -l; echo @@H; git rev-parse HEAD 2>/dev/null; echo @@N; head -c 4000 ${NEEDS_SECRETS} 2>/dev/null; echo; echo @@E`,
    25,
  );
  const s = sections(r.out);
  if ("GONE" in s) return null;
  let marker: SiteMarker | null = null;
  try {
    marker = s.M ? (JSON.parse(s.M) as SiteMarker) : null;
  } catch {
    marker = null;
  }
  let needs: SecretRequest[] = [];
  try {
    const list = s.N ? (JSON.parse(s.N) as unknown) : [];
    if (Array.isArray(list))
      needs = list
        .filter((n): n is { name: string; why?: unknown } => !!n && typeof n === "object" && typeof (n as { name?: unknown }).name === "string")
        .map((n) => ({ name: n.name.trim().toUpperCase(), why: typeof n.why === "string" ? n.why.slice(0, 200) : undefined }))
        .filter((n) => SECRET_NAME.test(n.name))
        .slice(0, 20);
  } catch {
    needs = [];
  }
  const code = Number(s.L);
  return { marker, needs, live: code > 0 && code < 500, dirty: Number(s.D) > 0, head: s.H || null };
}

export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

function templateOf(marker: SiteMarker): SiteTemplate {
  return marker.template === "vite-react" || marker.template === "fullstack" ? marker.template : "static";
}

const shooting = new Set<string>();
const lastSync = new Map<string, { at: number; site: Website; preview: PreviewState }>();

/**
 * Reads the site's marker and dev server; once the agent reports the site ready and the dev server
 * answers, creates the preview URL. `taskIdle` lets it checkpoint work a finished run left uncommitted.
 */
export async function syncWebsite(session: Session, row: WebsiteRow, opts: { taskIdle?: boolean; force?: boolean } = {}): Promise<{ site: Website; preview: PreviewState }> {
  const cached = lastSync.get(row.id);
  if (!opts.force && cached && Date.now() - cached.at < 4000) return cached;
  const ctx = await ctxFor(session, row);
  let p: Probe | null;
  try {
    p = await probe(ctx, row);
  } catch (err) {
    if (err instanceof SiteError && err.status === 503) {
      const out = { site: toWebsite(row), preview: { state: "paused" as const, url: row.preview_url } };
      lastSync.set(row.id, { at: Date.now(), ...out });
      return out;
    }
    throw err;
  }
  const patch: Partial<WebsiteRow> = {};
  let state: PreviewState["state"] = "building";
  if (p?.marker?.status === "ready") {
    const template = templateOf(p.marker);
    if (row.template !== template) patch.template = template;
    const features = Array.isArray(p.marker.features) ? p.marker.features.filter((f): f is string => typeof f === "string").slice(0, 10) : [];
    if (JSON.stringify(features) !== JSON.stringify(row.meta?.features ?? [])) patch.meta = patchMeta(row, { features });
    if (p.marker.title && row.name === "New website") patch.name = p.marker.title.slice(0, 80);
    let live = p.live;
    // The app, not the agent, runs the dev server (no approval prompts, survives the agent's command limits).
    if (!live && !row.meta?.previewStopped && row.dev_port) {
      await prepareLaunch(ctx, row, p.marker).catch(() => undefined);
      const r = await sh(ctx, launchDev(row, p.marker, 12), 40).catch(() => ({ out: "", code: 1 }));
      const code = Number(r.out.trim().slice(-3));
      live = code > 0 && code < 500;
    }
    state = live ? "live" : "stopped";
    if (live && !row.preview_url && row.dev_port) {
      const url = await ensureUrl(ctx, row.dev_port, `pv-${row.folder?.split("/").pop() ?? "site"}`, "link");
      patch.preview_url = url.url;
      patch.meta = { ...patchMeta(row, patch.meta ?? {}), previewUrlId: url.id };
    }
    if (row.status === "building") patch.status = "ready";
  }
  if (p && opts.taskIdle && p.dirty && p.marker?.status === "ready") {
    await commit(ctx, row, "Update from the agent", state === "live").catch(() => undefined);
  } else if (p?.head && opts.taskIdle && state === "live" && p.head !== row.meta?.thumbSha && !shooting.has(row.id)) {
    // The agent committed on its own: capture that version's screenshot in the background (once).
    shooting.add(row.id);
    void screenshot(ctx, row, p.head).finally(() => shooting.delete(row.id));
  }
  const next = Object.keys(patch).length ? await save(ctx, row, patch) : row;
  let needsSecrets: SecretRequest[] | undefined;
  if (p?.needs.length) {
    const have = new Set((await sealedWebsiteSecrets(ctx.userId, row.id).catch(() => [])).map((x) => x.name));
    needsSecrets = p.needs.filter((n) => !have.has(n.name));
  }
  const out = { site: toWebsite(next), preview: { state, url: state === "building" ? null : next.preview_url, ...(needsSecrets?.length ? { needsSecrets } : {}) } };
  lastSync.set(row.id, { at: Date.now(), ...out });
  return out;
}

async function readMarker(ctx: Ctx, row: WebsiteRow): Promise<SiteMarker> {
  const r = await sh(ctx, `cat ${q(row.folder ?? "/nonexistent")}/${MARKER} 2>/dev/null`, 20);
  try {
    const m = JSON.parse(r.out) as SiteMarker;
    if (m && m.status === "ready") return m;
  } catch {
    // below
  }
  throw new SiteError("The agent has not reported a working site yet.", 409);
}

/**
 * The preview command. Static sites always use the kit's server (it injects the click-to-edit inspector and never
 * serves hidden files); full-stack sites run their own server.mjs in preview mode; vite uses the agent's command.
 */
function devCommand(row: WebsiteRow, marker: SiteMarker): string {
  const template = templateOf(marker);
  if (template === "static") return `OM_SITE_DIR=${q(row.folder!)} OM_ROOT=${q(row.folder!)} exec node ${KIT_DIR}/static-serve.mjs`;
  if (template === "fullstack") return `OM_SITE_DIR=${q(row.folder!)} exec node server.mjs`;
  return marker.dev?.trim() || TEMPLATES["vite-react"].dev;
}

/** Before a preview or publish starts: the kit is current and the env file holds the latest secrets. */
async function prepareLaunch(ctx: Ctx, row: WebsiteRow, marker: SiteMarker, forceEnv = false): Promise<void> {
  await ensureKit(ctx);
  if (templateOf(marker) === "fullstack" && isSiteFolder(row.folder)) {
    // The template's runtime files are the kit's (the contract says not to edit them): keep them current.
    await sh(ctx, ["server.mjs", "om-runtime.mjs"].map((f) => `cmp -s ${KIT_DIR}/fullstack/${f} ${q(row.folder!)}/${f} || cp ${KIT_DIR}/fullstack/${f} ${q(row.folder!)}/${f}`).join("; "), 20);
  }
  if (templateOf(marker) === "fullstack" || forceEnv || row.meta?.envDirty) await writeSiteEnv(ctx, row);
}

/** Starts the dev server detached unless the port already answers, then waits up to `wait` seconds. Prints the HTTP code last. */
function launchDev(row: WebsiteRow, marker: SiteMarker, wait: number): string {
  const port = row.dev_port!;
  return `cd ${q(row.folder!)} && mkdir -p .openman && if ! curl -s -o /dev/null -m 2 http://127.0.0.1:${port}/; then PORT=${port} setsid nohup sh -c ${q(devCommand(row, marker))} > .openman/dev.log 2>&1 < /dev/null & fi; ${waitPort(port, wait)}`;
}

/** Wakes the computer if needed, starts the dev server and makes sure the preview URL exists. */
export async function startPreview(session: Session, row: WebsiteRow): Promise<{ site: Website; preview: PreviewState }> {
  const ctx = await ctxFor(session, row);
  if (!(await computerRunning(ctx))) {
    await ctx.client.startComputer(ctx.computerId);
    for (let i = 0; i < 20 && !(await computerRunning(ctx)); i++) await new Promise((r) => setTimeout(r, 1500));
  }
  const marker = await readMarker(ctx, row);
  const port = row.dev_port!;
  await prepareLaunch(ctx, row, marker, true);
  const r = await sh(ctx, launchDev(row, marker, 25), 60);
  const code = Number(r.out.trim().slice(-3));
  if (!(code > 0 && code < 500)) throw new SiteError("The dev server did not start. Ask the agent to check it.", 502);
  lastSync.delete(row.id);
  const url = await ensureUrl(ctx, port, `pv-${row.folder!.split("/").pop()}`, "link");
  const next = await save(ctx, row, { preview_url: url.url, meta: patchMeta(row, { previewUrlId: url.id, previewStopped: false }), ...(row.status === "building" ? { status: "ready" as const } : {}) });
  return { site: toWebsite(next), preview: { state: "live", url: url.url } };
}

/** Stops the dev server and removes the preview URL. */
export async function stopPreview(session: Session, row: WebsiteRow): Promise<Website> {
  const ctx = await ctxFor(session, row);
  if (row.dev_port) await sh(ctx, killPort(row.dev_port), 20).catch(() => undefined);
  await removeUrl(ctx, row.meta?.previewUrlId, row.dev_port);
  lastSync.delete(row.id);
  return toWebsite(await save(ctx, row, { preview_url: null, meta: patchMeta(row, { previewUrlId: null, previewStopped: true }) }));
}

/* ---------------------------------------------------------------- versions */

async function screenshot(ctx: Ctx, row: WebsiteRow, sha: string): Promise<boolean> {
  if (!row.folder || !row.dev_port) return false;
  const shot = `${row.folder}/.openman/shots/${sha}.png`;
  const r = await sh(
    ctx,
    `mkdir -p ${q(row.folder)}/.openman/shots && curl -s -o /dev/null -m 3 http://127.0.0.1:${row.dev_port}/ && timeout 45 google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --user-data-dir=/tmp/om-shot-profile --window-size=1280,800 --virtual-time-budget=4000 --screenshot=${q(shot)} http://127.0.0.1:${row.dev_port}/ >/dev/null 2>&1; [ -s ${q(shot)} ] && echo SHOT`,
    60,
  ).catch(() => ({ out: "", code: 1 }));
  const ok = r.out.includes("SHOT");
  if (ok) {
    const fresh = (await getWebsiteRow(ctx.userId, row.id).catch(() => null)) ?? row;
    await updateWebsiteRow(ctx.userId, row.id, { meta: patchMeta(fresh, { thumbSha: sha }) }).catch(() => undefined);
  }
  return ok;
}

async function commit(ctx: Ctx, row: WebsiteRow, message: string, shoot: boolean): Promise<string | null> {
  const r = await sh(ctx, `cd ${q(row.folder!)} && git add -A && { git diff --cached --quiet || ${GIT} commit -qm ${q(message.slice(0, 120))}; } && git rev-parse HEAD`, 40);
  const sha = r.out.trim().split("\n").pop() ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  if (shoot) await screenshot(ctx, row, sha);
  return sha;
}

export async function listCheckpoints(session: Session, row: WebsiteRow): Promise<SiteCheckpoint[]> {
  if (!row.folder) return [];
  const ctx = await ctxFor(session, row);
  const r = await sh(ctx, `cd ${q(row.folder)} && git log -n 60 --format='%H%x1f%s%x1f%cI' 2>/dev/null; echo @@S; ls -1 .openman/shots 2>/dev/null`, 25);
  const [log, shots] = r.out.split("@@S");
  const have = new Set((shots ?? "").split(/\s+/).filter(Boolean).map((f) => f.replace(/\.png$/, "")));
  return log
    .split("\n")
    .map((l) => l.split("\x1f"))
    .filter((p) => p.length === 3 && /^[0-9a-f]{40}$/.test(p[0]))
    .map(([sha, message, at]) => ({ sha, message, at, screenshot: have.has(sha), published: row.meta?.publishedSha === sha }));
}

export async function createCheckpoint(session: Session, row: WebsiteRow, message: string): Promise<SiteCheckpoint[]> {
  const ctx = await ctxFor(session, row);
  const sha = await commit(ctx, row, message || "Checkpoint", true);
  if (!sha) throw new SiteError("Nothing could be saved.", 409);
  // A version saved while nothing changed still gets a screenshot.
  await screenshot(ctx, row, sha);
  if (row.auto_publish && row.status === "published") await publish(session, (await getWebsiteRow(session.userId, row.id)) ?? row).catch(() => undefined);
  return listCheckpoints(session, row);
}

/** Restores the files of `sha` as a new version on top (history is kept, so a rollback can be undone). */
export async function rollback(session: Session, row: WebsiteRow, sha: string): Promise<SiteCheckpoint[]> {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new SiteError("Unknown version.", 400);
  const ctx = await ctxFor(session, row);
  const r = await sh(
    ctx,
    `cd ${q(row.folder!)} && git cat-file -e ${sha}^{commit} && git add -A && { git diff --cached --quiet || ${GIT} commit -qm "Before rollback"; } && git reset -q --hard ${sha} && git reset -q --soft ORIG_HEAD && ${GIT} commit -q --allow-empty -m ${q(`Rolled back to ${sha.slice(0, 7)}`)} && git rev-parse HEAD`,
    40,
  );
  const head = r.out.trim().split("\n").pop() ?? "";
  if (!/^[0-9a-f]{40}$/.test(head)) throw new SiteError("That version could not be restored.", 409);
  await screenshot(ctx, row, head);
  if (row.auto_publish && row.status === "published") await publish(session, row).catch(() => undefined);
  return listCheckpoints(session, row);
}

export async function checkpointScreenshot(session: Session, row: WebsiteRow, sha: string): Promise<Buffer | null> {
  if (!/^[0-9a-f]{40}$/.test(sha) || !row.folder) return null;
  const ctx = await ctxFor(session, row);
  return readFile(ctx, `${row.folder}/.openman/shots/${sha}.png`);
}

/* ---------------------------------------------------------------- files off the computer */

const CHUNK = 6 * 1024 * 1024;

async function readFile(ctx: Ctx, path: string, max = 100 * 1024 * 1024): Promise<Buffer | null> {
  const first = await sh(ctx, `f=${q(path)}; [ -f "$f" ] || { echo MISSING; exit 0; }; stat -c %s -- "$f"; head -c ${CHUNK} -- "$f" | base64 -w0`, 60);
  const nl = first.out.indexOf("\n");
  const head = (nl < 0 ? first.out : first.out.slice(0, nl)).trim();
  if (head === "MISSING") return null;
  const size = Number(head);
  if (!Number.isFinite(size)) throw new SiteError("The file could not be read from the computer.", 502);
  if (size > max) throw new SiteError("The site is too large to download here.", 413);
  const chunks = [Buffer.from(nl < 0 ? "" : first.out.slice(nl + 1).trim(), "base64")];
  let have = chunks[0].length;
  while (have < size) {
    const next = await sh(ctx, `tail -c +${have + 1} -- ${q(path)} | head -c ${CHUNK} | base64 -w0`, 60);
    const chunk = Buffer.from(next.out.trim(), "base64");
    if (!chunk.length) break;
    chunks.push(chunk);
    have += chunk.length;
  }
  return Buffer.concat(chunks);
}

/** The site's source as a .tar.gz (no node_modules, build output or git data). */
export async function downloadArchive(session: Session, row: WebsiteRow): Promise<{ name: string; bytes: Buffer }> {
  if (!row.folder) throw new SiteError("This site has no files yet.", 409);
  const ctx = await ctxFor(session, row);
  const base = row.folder.split("/").pop()!;
  const tmp = `/tmp/om-site-${row.id}.tar.gz`;
  await sh(ctx, `cd ${q(row.folder)}/.. && tar czf ${q(tmp)} --exclude=${q(`${base}/node_modules`)} --exclude=${q(`${base}/dist`)} --exclude=${q(`${base}/.git`)} --exclude=${q(`${base}/.openman`)} ${q(base)}`, 120);
  const bytes = await readFile(ctx, tmp);
  await sh(ctx, `rm -f ${q(tmp)}`, 10).catch(() => undefined);
  if (!bytes) throw new SiteError("The archive could not be made.", 502);
  return { name: `${base}.tar.gz`, bytes };
}

/* ---------------------------------------------------------------- publish */

function badgeScript(): string {
  // Inserted before </body> of every top-level HTML page of the release when the badge is on.
  const html = `<a href="https://www.orgo.ai" target="_blank" rel="noopener" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#111;color:#fff;font:500 12px/16px system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.25)" data-om-badge>Built with ${brand.name}</a>`;
  return `import glob,io\nb=${JSON.stringify(html)}\nfor f in glob.glob('*.html'):\n  s=io.open(f,encoding='utf-8',errors='ignore').read()\n  if 'data-om-badge' in s: continue\n  s=s.replace('</body>',b+'</body>',1) if '</body>' in s else s+b\n  io.open(f,'w',encoding='utf-8').write(s)\n`;
}

/** True for `/root/sites/<slug>` exactly (no traversal, no nesting). */
export function isSiteFolder(folder: string | null | undefined): folder is string {
  return typeof folder === "string" && new RegExp(`^${SITES_ROOT}/[a-z0-9][a-z0-9-]{0,80}$`).test(folder);
}

/**
 * Copies the build output into `.openman/release.tmp`, serving only the site's own files:
 * the output folder must resolve (symlinks followed) inside the site folder, which itself must resolve under the
 * sites directory; hidden files and folders (dotfiles, `.git`, `.openman`, `.env`) and `node_modules` are never
 * copied; a symlink is copied as the file it points to only when that file is inside the site, otherwise skipped;
 * symlinked folders are skipped. So a marker pointing at `/root/.hermes`, or a link to it, publishes nothing secret.
 */
export const RELEASE_COPY = [
  "import os, shutil, sys",
  "root = os.path.realpath('/root/sites')",
  "site = os.path.realpath(sys.argv[1])",
  "if os.path.dirname(site) != root: print('OUTSIDE_SITES'); sys.exit(3)",
  "out = os.path.realpath(os.path.join(site, sys.argv[2]))",
  "if not (out == site or out.startswith(site + os.sep)): print('OUTSIDE_SITE'); sys.exit(3)",
  "if any(p.startswith('.') or p == 'node_modules' for p in os.path.relpath(out, site).split(os.sep) if p != '.'): print('HIDDEN_OUTPUT'); sys.exit(3)",
  "dest = os.path.join(site, '.openman', 'release.tmp')",
  "skip_top = {'dist'} if out == site else set()",
  "n = 0",
  "for cur, dirs, files in os.walk(out, followlinks=False):",
  "    rel = os.path.relpath(cur, out)",
  "    dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules' and not os.path.islink(os.path.join(cur, d)) and not (rel == '.' and d in skip_top)]",
  "    os.makedirs(os.path.join(dest, rel), exist_ok=True)",
  "    for f in files:",
  "        if f.startswith('.'): continue",
  "        src = os.path.join(cur, f)",
  "        real = os.path.realpath(src)",
  "        inside = real.startswith(site + os.sep) and not any(p.startswith('.') or p == 'node_modules' for p in os.path.relpath(real, site).split(os.sep))",
  "        if not inside or not os.path.isfile(real): continue",
  "        shutil.copyfile(real, os.path.join(dest, rel, f)); n += 1",
  "print('COPIED', n)",
].join("\n");

/** Builds the site, copies the output to `.openman/release`, serves it on the prod port and opens its URL. */
export async function publish(session: Session, row: WebsiteRow): Promise<Website> {
  const ctx = await ctxFor(session, row);
  const marker = await readMarker(ctx, row);
  const folder = row.folder!;
  const prod = row.prod_port!;
  row = await save(ctx, row, { status: "publishing", meta: patchMeta(row, { error: null }) });
  try {
    await prepareLaunch(ctx, row, marker, true);
    await writeSchedules(ctx, row);
    const out = (marker.output || ".").replace(/^\.\/?/, "") || ".";
    if (!isSiteFolder(folder)) throw new SiteError("This site's folder is not under the sites directory.", 400);
    if (out.startsWith("/") || out.split("/").some((p) => p === ".." || (p.startsWith(".") && p !== "."))) throw new SiteError("The site's output folder must be a plain folder inside the site.", 400);
    const copy = `python3 -c ${q(RELEASE_COPY)} ${q(folder)} ${q(out)}`;
    const r = await sh(
      ctx,
      [
        `cd ${q(folder)}`,
        marker.build ? `(${marker.build}) > .openman/build.log 2>&1 || { echo BUILD_FAILED; tail -c 600 .openman/build.log; exit 1; }` : "true",
        `rm -rf .openman/release.tmp && mkdir -p .openman/release.tmp`,
        copy,
        row.show_badge ? `(cd .openman/release.tmp && python3 -c ${q(badgeScript())})` : "true",
        `rm -rf .openman/release && mv .openman/release.tmp .openman/release`,
        `git rev-parse HEAD`,
      ].join(" && "),
      300,
    );
    if (r.code !== 0 || r.out.includes("BUILD_FAILED")) throw new SiteError(`The build failed: ${r.out.replace("BUILD_FAILED", "").trim().slice(-500)}`, 422);
    const sha = r.out.trim().split("\n").pop() ?? null;
    const release = `${folder}/.openman/release`;
    const env = `env PORT=${prod} OM_PUBLISHED=1 OM_SITE_DIR=${folder}`;
    const template = templateOf(marker);
    // The published process logs page views and runs scheduled jobs (the kit's runtime); a vite build is served statically.
    const serve =
      template === "fullstack" ? `${env} node ${release}/server.mjs` : `${env} OM_ROOT=${release} node ${KIT_DIR}/static-serve.mjs`;
    // Replace whatever served the last release (an older command, or old code still in memory).
    await removeServiceOnPort(ctx, prod);
    await sh(ctx, killPort(prod), 20).catch(() => undefined);
    const app = await ctx.client.request<{ id: string; url: string; access: string }>(
      "POST",
      `/computers/${encodeURIComponent(ctx.computerId)}/apps`,
      { port: prod, title: row.name.slice(0, 80) || "Website", name: slugify(row.folder!.split("/").pop() ?? row.name), command: serve, cwd: template === "fullstack" ? release : folder },
      { timeoutMs: 60_000 },
    );
    // Orgo's service normally starts it; start it here too if nothing answers yet.
    const up = await sh(ctx, `${waitPort(prod, 10)} >/dev/null; curl -s -o /dev/null -m 2 http://127.0.0.1:${prod}/ || (cd ${q(template === "fullstack" ? release : folder)} && setsid nohup ${serve} > ${q(folder)}/.openman/serve.log 2>&1 < /dev/null &); ${waitPort(prod, 15)}`, 60);
    const code = Number(up.out.trim().slice(-3));
    if (!(code > 0 && code < 500)) throw new SiteError("The published site did not start.", 502);
    const url = await ensureUrl(ctx, prod, row.folder!.split("/").pop()!, ACCESS[row.visibility]);
    const next = await save(ctx, row, {
      status: "published",
      published_url: url.url,
      url: url.url,
      published_at: new Date().toISOString(),
      meta: patchMeta(row, { publishedUrlId: url.id, publishedAppId: app.id, publishedSha: sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null, error: null }),
    });
    return toWebsite(next);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await save(ctx, row, { status: row.published_url ? "published" : "failed", meta: patchMeta(row, { error: message }) });
    throw err instanceof SiteError ? err : new SiteError(message, err instanceof OrgoError ? (err.status >= 400 && err.status < 500 ? err.status : 502) : 500);
  }
}

export async function unpublish(session: Session, row: WebsiteRow): Promise<Website> {
  const ctx = await ctxFor(session, row);
  if (row.prod_port) {
    await removeServiceOnPort(ctx, row.prod_port);
    await removeUrl(ctx, row.meta?.publishedUrlId, row.prod_port);
    await sh(ctx, killPort(row.prod_port), 20).catch(() => undefined);
  }
  return toWebsite(
    await save(ctx, row, { status: "unpublished", published_url: null, url: null, meta: patchMeta(row, { publishedUrlId: null, publishedAppId: null, publishedSha: null }) }),
  );
}

/** Changes who may open the published site. `emails` invite people for "invite" (Orgo emails them a code). */
export async function setVisibility(session: Session, row: WebsiteRow, visibility: SiteVisibility, emails: string[] = []): Promise<Website> {
  const ctx = await ctxFor(session, row);
  const meta: WebsiteMeta = {};
  if (row.status === "published" && row.prod_port) {
    const url = await findUrlOnPort(ctx, row.prod_port);
    if (url && url.access !== ACCESS[visibility]) await ctx.client.updatePublicUrl(ctx.computerId, url.id, { access: ACCESS[visibility] });
    if (visibility === "invite" && emails.length && row.meta?.publishedAppId) {
      // Orgo's mailer sends each invitation: a per-user daily and monthly cap keeps it from being used for spam.
      try {
        await consumeUsage(session.userId, "site_invites", emails.length);
      } catch (err) {
        if (err instanceof UsageLimitError) throw new SiteError(err.message, 429);
        throw err;
      }
      await ctx.client.request("POST", `/apps/${encodeURIComponent(row.meta.publishedAppId)}/shares`, { emails, notify: true });
      meta.invited = [...new Set([...(row.meta?.invited ?? []), ...emails])];
    }
  } else if (emails.length) meta.invited = [...new Set([...(row.meta?.invited ?? []), ...emails])];
  return toWebsite(await save(ctx, row, { visibility, meta: patchMeta(row, meta) }));
}

export async function updateSettings(session: Session, row: WebsiteRow, patch: { name?: string; autoPublish?: boolean; showBadge?: boolean }): Promise<Website> {
  const p: Partial<WebsiteRow> = {};
  if (patch.name !== undefined) p.name = patch.name.trim().slice(0, 80) || row.name;
  if (patch.autoPublish !== undefined) p.auto_publish = patch.autoPublish;
  if (patch.showBadge !== undefined) p.show_badge = patch.showBadge;
  if (!Object.keys(p).length) return toWebsite(row);
  const next = (await updateWebsiteRow(session.userId, row.id, p)) ?? row;
  return toWebsite(next);
}

/* ---------------------------------------------------------------- copy and delete */

export async function copyWebsite(session: Session, row: WebsiteRow): Promise<Website> {
  if (!row.folder) throw new SiteError("This site has no files yet.", 409);
  const ctx = await ctxFor(session, row);
  const [used, listening] = await Promise.all([usedPorts(ctx.userId, ctx.computerId), listeningPorts(ctx)]);
  const devPort = pickPort(DEV_PORTS, used, listening);
  const prodPort = pickPort(PROD_PORTS, new Set([...used, devPort]), listening);
  const slug = await freeSlug(ctx, `${row.folder.split("/").pop()}-copy`);
  const folder = siteFolder(slug);
  const py = `import json;p='${MARKER}';m=json.load(open(p));m['port']=${devPort};json.dump(m,open(p,'w'))`;
  const r = await sh(
    ctx,
    `cp -a ${q(row.folder)} ${q(folder)} && cd ${q(folder)} && rm -rf .openman/release .openman/shots && (python3 -c ${q(py)} || true) && echo OK`,
    120,
  );
  if (!r.out.includes("OK")) throw new SiteError("The site could not be copied.", 502);
  const copy = await insertWebsiteRow(ctx.userId, {
    id: crypto.randomUUID(),
    name: `${row.name} (copy)`.slice(0, 80),
    slug: `${slug}-${crypto.randomUUID().slice(0, 6)}`,
    task_id: null,
    computer_id: ctx.computerId,
    folder,
    template: row.template,
    dev_port: devPort,
    prod_port: prodPort,
    status: row.status === "building" ? "building" : "ready",
    visibility: row.visibility,
    auto_publish: false,
    show_badge: row.show_badge,
    meta: { taskIds: [] },
  });
  return toWebsite(copy);
}

/** Unpublishes, stops the preview, deletes the folder and the record. */
export async function deleteWebsite(session: Session, row: WebsiteRow): Promise<void> {
  const ctx = await ctxFor(session, row);
  try {
    if (row.prod_port) {
      await removeServiceOnPort(ctx, row.prod_port);
      await removeUrl(ctx, row.meta?.publishedUrlId, row.prod_port);
    }
    await removeUrl(ctx, row.meta?.previewUrlId, row.dev_port);
    const kills = [row.dev_port, row.prod_port].filter((p): p is number => !!p).map(killPort).join("; ");
    const rm = row.folder && row.folder.startsWith("/root/sites/") && !row.folder.includes("..") ? `rm -rf ${q(row.folder)}` : "true";
    await sh(ctx, `${kills || "true"}; ${rm}`, 60);
  } catch (err) {
    // A sleeping computer keeps its files; the record still goes so the user is not stuck.
    if (!(err instanceof SiteError && err.status === 503)) throw err;
  }
  lastSync.delete(row.id);
  await deleteWebsiteRow(session.userId, row.id);
}
