/**
 * Generators, server half: which generators this user can use, starting a generator task, and reading
 * what a generator task produced (state, slide deck bundle, exports, files in its folder).
 *
 * Everything on the computer goes through Orgo's Desktop API `/bash` (`computerBash`) and the helper
 * program `om_gen.py` (`helper-program.ts`), which this module installs on demand.
 */
import { createHash, randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { CreateTaskInput } from "@/lib/agent/types";
import { modelFor } from "@/lib/agent/types";
import { ComputerError, computerBash, readComputerFile, shellQuote, type ComputerConfig } from "@/lib/agent/server/computer";
import { computerFor, hermesTarget } from "@/lib/agent/server/connection";
import { createRuntime, liveRuntime } from "@/lib/agent/server/relay";
import { deriveTitle, newTaskId } from "@/lib/agent/server/tasks";
import { getProject } from "@/lib/db/projects";
import { agentContextFor } from "@/lib/personalization/profile";
import { toSummary, type Store, type TaskRecord, type TaskView } from "@/lib/store/types";
import { contractFor } from "./contracts";
import { HELPER_PY } from "./helper-program";
import { estimateWideResearch } from "./pricing";
import { vendorAudio } from "@/lib/voice/audio-gen";
import { GENERATOR_TAG_RE, OFFICIAL_SKILL, OUTPUT, WIDE_RESEARCH_GO } from "./registry";
import { DEFAULT_THEME, themeById, themeCss } from "./themes";
import type {
  AudioSet,
  DataAnalysis,
  DeckBundle,
  ExportFormat,
  GeneratorAvailability,
  GeneratorKind,
  GeneratorMarker,
  GeneratorState,
  GeneratorVariant,
  ResearchPlan,
  ResearchResult,
  ResearchState,
  SlideDeck,
} from "./types";

export class GeneratorError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ helper */

const HELPER_HASH = createHash("sha256").update(HELPER_PY).digest("hex").slice(0, 12);
const HELPER_B64 = Buffer.from(HELPER_PY, "utf8").toString("base64");
const HELPER = "$HOME/.openman/bin/om_gen.py";
/** Shell that makes sure the current helper is installed, then runs whatever follows. */
const INSTALL_HELPER = `export HOME=\${HOME:-/root}; mkdir -p "$HOME/.openman/bin"; [ -f "$HOME/.openman/bin/.v-${HELPER_HASH}" ] || { printf %s '${HELPER_B64}' | base64 -d > "${HELPER}" && rm -f "$HOME"/.openman/bin/.v-* && touch "$HOME/.openman/bin/.v-${HELPER_HASH}"; };`;

function computer(store: Store): ComputerConfig {
  const cfg = computerFor(store.ownerId);
  if (!cfg) throw new GeneratorError("Your agent computer isn't set up yet. Open Computers to create it, then try again.", 409);
  return cfg;
}

async function bash(cfg: ComputerConfig, command: string, timeout = 60): Promise<string> {
  try {
    const r = await computerBash(cfg, command, timeout);
    return r.output;
  } catch (err) {
    if (err instanceof ComputerError) throw new GeneratorError(err.message, err.status === 404 ? 404 : 502);
    throw err;
  }
}

/** Runs one helper subcommand and parses its JSON answer (the last line of output that is JSON). */
async function helper<T>(cfg: ComputerConfig, args: string[], timeout = 60): Promise<T> {
  const output = await bash(cfg, `${INSTALL_HELPER} python3 "${HELPER}" ${args.map(shellQuote).join(" ")}`, timeout);
  const start = output.indexOf("{");
  if (start < 0) throw new GeneratorError(`The computer gave no answer${output ? `: ${output.slice(-200)}` : ""}.`, 502);
  try {
    return JSON.parse(output.slice(start)) as T;
  } catch {
    throw new GeneratorError("The computer's answer could not be read.", 502);
  }
}

/* ------------------------------------------------------------ availability */

interface Probe {
  python3: boolean;
  chrome: boolean;
  ffmpeg: boolean;
  venv: boolean;
  fetch: boolean;
  toolsets: string[];
  keys: string[];
}

const IMAGE_KEYS = ["FAL_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "KREA_API_KEY"];
const VIDEO_KEYS = ["XAI_API_KEY", "FAL_KEY"];

const NEEDS = {
  image:
    "Hermes' image_generate tool needs an image provider key (FAL_KEY, OPENAI_API_KEY, XAI_API_KEY or KREA_API_KEY) in ~/.hermes/.env on the user's computer and the image_gen toolset in platform_toolsets.api_server of ~/.hermes/config.yaml. Orgo's connectors cannot supply it: Composio's model-running toolkits (composio, gemini and the like) are on Orgo's deny list until they are metered.",
  video:
    "Hermes' video_generate tool needs a video provider key (XAI_API_KEY or FAL_KEY) in ~/.hermes/.env on the user's computer and the video_gen toolset in platform_toolsets.api_server of ~/.hermes/config.yaml. No Orgo connector offers video generation.",
  audio: "Speech uses edge-tts on the user's computer, which needs python3 and network access to install it; the computer could not be checked.",
  agent: "Needs the user's agent computer.",
};

/**
 * Audio: speech through edge-tts on the computer, or ElevenLabs speech and sound effects through the server's key
 * (operator-billed, so capped per user in `src/config/usage-limits.ts`; the key never reaches the computer). Music
 * is offered only when the operator's plan allows it (`ELEVENLABS_MUSIC=1`); the free tier answers 402.
 */
function audioAvailability(agentOk: boolean, probe: Probe | null): GeneratorAvailability {
  const server = vendorAudio();
  const edge = !!(probe && probe.python3 && (probe.venv || probe.fetch));
  const features: NonNullable<GeneratorAvailability["features"]> = [];
  if (edge || server.speech) features.push("speech");
  if (server.soundEffects) features.push("sound_effects");
  if (server.music) features.push("music");
  if (!agentOk) return { kind: "audio", available: false, needs: NEEDS.agent };
  return features.length ? { kind: "audio", available: true, features } : { kind: "audio", available: false, needs: NEEDS.audio };
}

const availCache = new Map<string, { at: number; list: GeneratorAvailability[] }>();
const AVAIL_TTL = 5 * 60_000;

/** Which generators this user can use today. Generators that need only the agent are on whenever it is. */
export async function availability(store: Store, refresh = false): Promise<GeneratorAvailability[]> {
  const owner = store.ownerId;
  const known = availCache.get(owner);
  if (!refresh && known && Date.now() - known.at < AVAIL_TTL) return known.list;
  const target = hermesTarget(owner);
  const agentOk = target.kind === "hermes";
  const cfg = computerFor(owner);
  let probe: Probe | null = null;
  if (agentOk && cfg) probe = await helper<Probe>(cfg, ["probe"], 25).catch(() => null);
  const has = (keys: string[]) => !!probe?.keys.some((k) => keys.includes(k));
  const list: GeneratorAvailability[] = [
    { kind: "slides", available: agentOk && (!probe || probe.chrome || probe.python3), ...(agentOk ? {} : { needs: NEEDS.agent }) },
    { kind: "research", available: agentOk, ...(agentOk ? {} : { needs: NEEDS.agent }) },
    { kind: "data", available: agentOk, ...(agentOk ? {} : { needs: NEEDS.agent }) },
    audioAvailability(agentOk, probe),
    probe && has(IMAGE_KEYS) && probe.toolsets.includes("image_gen") ? { kind: "image", available: true } : { kind: "image", available: false, needs: NEEDS.image },
    probe && has(VIDEO_KEYS) && probe.toolsets.some((t) => t === "video_gen" || t === "video") ? { kind: "video", available: true } : { kind: "video", available: false, needs: NEEDS.video },
  ];
  // A failed probe is not cached for long: the computer may simply have been asleep.
  availCache.set(owner, { at: probe || !agentOk ? Date.now() : Date.now() - AVAIL_TTL + 30_000, list });
  return list;
}

/* ------------------------------------------------------------------- start */

export interface StartInput {
  kind: GeneratorKind;
  variant?: GeneratorVariant;
  theme?: string;
  input: CreateTaskInput;
}

const KIND_DIRS: Record<GeneratorKind, string[]> = {
  slides: [OUTPUT.slides.dir, `${OUTPUT.slides.dir}/assets`],
  data: [OUTPUT.data.dir, `${OUTPUT.data.dir}/charts`],
  research: [OUTPUT.research.dir, OUTPUT.research.items],
  audio: [OUTPUT.audio.dir],
  image: [OUTPUT.image.dir],
  video: [OUTPUT.video.dir],
};

const DATA_URL = /^data:([^;,]*)?(;base64)?,/;
const ARG_BUDGET = 90_000;

function safeFileName(name: string, used: Set<string>): string {
  let base = name.split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").trim().slice(0, 120) || "file";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 2; used.has(base); i++) base = `${stem}-${i}${ext}`;
  used.add(base);
  return base;
}

/** Writes the user's attachments into `<folder>/inputs/`. Returns their absolute paths; links that are not data URLs are passed on as they are. */
async function stageInputs(cfg: ComputerConfig, folder: string, attachments: CreateTaskInput["attachments"]): Promise<{ paths: string[]; links: string[] }> {
  const paths: string[] = [];
  const links: string[] = [];
  const used = new Set<string>();
  for (const a of attachments ?? []) {
    if (a.path) {
      // Already on the computer (uploaded through /api/tasks/uploads): copy it into the inputs folder.
      const dest = `${folder}/${OUTPUT.inputs}/${safeFileName(a.name, used)}`;
      await bash(cfg, `cp -f -- ${shellQuote(a.path)} ${shellQuote(dest)}`);
      paths.push(dest);
      continue;
    }
    if (!a.url) continue;
    const m = DATA_URL.exec(a.url);
    if (!m) {
      links.push(`${a.name}: ${a.url}`);
      continue;
    }
    const raw = a.url.slice(m[0].length);
    const b64 = m[2] ? raw : Buffer.from(decodeURIComponent(raw), "utf8").toString("base64");
    const dest = `${folder}/${OUTPUT.inputs}/${safeFileName(a.name, used)}`;
    const tmp = `/tmp/om-in-${randomBytes(6).toString("hex")}.b64`;
    await bash(cfg, `: > ${tmp}`);
    for (let i = 0; i < b64.length; i += ARG_BUDGET) await bash(cfg, `printf %s '${b64.slice(i, i + ARG_BUDGET)}' >> ${tmp}`);
    await bash(cfg, `base64 -d ${tmp} > ${shellQuote(dest)}; rm -f ${tmp}`);
    paths.push(dest);
  }
  return { paths, links };
}

/**
 * Starts a generator task: makes its folder (with the marker and, for slides, the theme), puts the
 * attachments on the computer, and starts the agent with the generator's contract as run instructions.
 * The user's own prompt is what the task shows.
 */
export async function startGenerator(store: Store, start: StartInput): Promise<TaskView> {
  const cfg = computer(store);
  const { kind, variant, input } = start;
  const id = newTaskId();
  const theme = kind === "slides" ? themeById(start.theme ?? DEFAULT_THEME) : null;
  const marker: GeneratorMarker = { version: 1, kind, ...(variant ? { variant } : {}), ...(theme ? { theme: theme.id } : {}), createdAt: new Date().toISOString() };
  const dirs = [".openman", OUTPUT.inputs, ...KIND_DIRS[kind]].map((d) => `"$F/${d}"`).join(" ");
  const writes = [
    `printf %s '${Buffer.from(JSON.stringify(marker)).toString("base64")}' | base64 -d > "$F/${OUTPUT.marker}"`,
    theme ? `printf %s '${Buffer.from(themeCss(theme)).toString("base64")}' | base64 -d > "$F/${OUTPUT.slides.theme}"` : "",
  ]
    .filter(Boolean)
    .join("; ");
  // Batch research needs sub-agent batches to return inside the turn. Hermes runs API-server delegations in the
  // background unless `delegation.gateway_mode` is "inline" (then the relay would never see the results).
  const inline = kind === "research" ? `grep -q "gateway_mode: inline" "$HOME/.hermes/config.yaml" 2>/dev/null || hermes config set delegation.gateway_mode inline >/dev/null 2>&1;` : "";
  const out = await bash(cfg, `${INSTALL_HELPER} ${inline} F="$HOME/tasks/${id}"; mkdir -p ${dirs} && ${writes} && echo "@@HOME=$HOME"`, 40);
  const home = /@@HOME=(\S+)/.exec(out)?.[1];
  if (!home) throw new GeneratorError(`Could not prepare the task folder on your computer${out ? `: ${out.slice(-200)}` : ""}.`, 502);
  const folder = `${home}/tasks/${id}`;
  const { paths, links } = await stageInputs(cfg, folder, input.attachments);

  const contract = contractFor(kind, variant, {
    folder,
    helper: `${home}/.openman/bin/om_gen.py`,
    python: `${home}/.openman/venv/bin/python`,
    theme: theme?.id,
    inputs: paths,
    vendorAudio: vendorAudio(),
  });
  const extra: string[] = [];
  let projectId: string | null = null;
  if (store.kind === "supabase") {
    const [profile, project] = await Promise.all([
      agentContextFor(store.ownerId),
      input.projectId ? getProject(store.ownerId, input.projectId).catch(() => null) : Promise.resolve(null),
    ]);
    if (profile.instructions) extra.push(profile.instructions);
    if (project) {
      projectId = project.id;
      if (project.instructions.trim()) extra.push(`Project "${project.name}" instructions:\n${project.instructions.trim()}`);
    }
  }
  const skill = OFFICIAL_SKILL[kind];
  const now = new Date().toISOString();
  const task: TaskRecord = {
    id,
    title: deriveTitle(input.prompt),
    status: "waking",
    createdAt: now,
    updatedAt: now,
    projectId,
    favorite: false,
    archived: false,
    meta: {
      instructions: [contract, ...extra].join("\n\n"),
      mode: input.mode,
      effort: input.effort,
      speed: input.speed,
      target: input.target?.kind === "cloud-persistent" ? undefined : input.target,
      connectors: input.connectors,
      ...(skill ? { skills: [skill] } : {}),
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
  const attached = [paths.length ? `Attached files (on your computer):\n${paths.map((p) => `- ${p}`).join("\n")}` : "", links.length ? `Attached links:\n${links.map((l) => `- ${l}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  runtime.begin(attached ? `${input.prompt}\n\n${attached}` : input.prompt, input.prompt);
  availCache.delete(store.ownerId);
  return toSummary(runtime.task);
}

/* ------------------------------------------------------------------- state */

interface RawState {
  folder: string;
  marker: GeneratorMarker | null;
  deck?: SlideDeck | null;
  updatedAt?: number;
  exports?: Partial<Record<ExportFormat, string>>;
  analysis?: DataAnalysis | null;
  plan?: ResearchPlan | null;
  progress?: { running?: string[] } | null;
  result?: ResearchResult | null;
  done?: string[];
  failed?: string[];
  audio?: AudioSet | null;
}

async function taskRecord(store: Store, taskId: string): Promise<TaskRecord | null> {
  return liveRuntime(store, taskId)?.task ?? (await store.getTask(taskId));
}

/** The generator a task runs, from the tag at the head of its instructions. Null for an ordinary task. */
export function generatorOf(task: TaskRecord): { kind: GeneratorKind; variant?: GeneratorVariant } | null {
  const m = GENERATOR_TAG_RE.exec(task.meta?.instructions ?? "");
  return m ? { kind: m[1] as GeneratorKind, ...(m[2] ? { variant: m[2] as GeneratorVariant } : {}) } : null;
}

const folders = new Map<string, string>();

async function folderOf(cfg: ComputerConfig, taskId: string): Promise<string> {
  const known = folders.get(taskId);
  if (known) return known;
  const out = await bash(cfg, `echo "@@HOME=\${HOME:-/root}"`, 15);
  const home = /@@HOME=(\S+)/.exec(out)?.[1] ?? "/root";
  const folder = `${home}/tasks/${taskId}`;
  folders.set(taskId, folder);
  return folder;
}

export interface TaskGeneratorContext {
  task: TaskRecord;
  kind: GeneratorKind;
  variant?: GeneratorVariant;
  cfg: ComputerConfig;
  folder: string;
}

/** The task, its generator and its folder, or null when the task is not the caller's or runs no generator. */
export async function generatorTask(store: Store, taskId: string): Promise<TaskGeneratorContext | null> {
  const task = await taskRecord(store, taskId);
  if (!task) return null;
  const gen = generatorOf(task);
  if (!gen) return null;
  const cfg = computer(store);
  return { task, ...gen, cfg, folder: await folderOf(cfg, taskId) };
}

function researchState(raw: RawState, task: TaskRecord, confirmed: boolean): ResearchState {
  const plan = raw.plan && typeof raw.plan === "object" && Array.isArray(raw.plan.items) ? raw.plan : null;
  const done = raw.done ?? [];
  const failed = raw.failed ?? [];
  const running = (raw.progress?.running ?? []).filter((id) => !done.includes(id) && !failed.includes(id));
  const result = raw.result ?? null;
  let phase: ResearchState["phase"] = "planning";
  if (result) phase = "done";
  else if (plan?.mode === "single") phase = "single";
  else if (plan) {
    const started = confirmed || !!raw.progress || done.length > 0;
    if (!started) phase = "awaiting-confirmation";
    else if (done.length + failed.length >= plan.items.length && running.length === 0) phase = "merging";
    else phase = "running";
  }
  const requested = modelFor(task.meta.mode, task.meta.effort);
  const model = task.meta.fallbackModel && requested === "claude-fable-5-2" ? task.meta.fallbackModel : requested === "claude-fable-5-2" ? "claude-opus-5-5" : requested;
  return { phase, plan, done, running, failed, estimate: plan?.mode === "wide" ? estimateWideResearch(plan.items.length, model) : null, result };
}

/** What a generator task has produced so far. `{ kind: null }` for an ordinary task. */
export async function generatorState(store: Store, taskId: string): Promise<GeneratorState | null> {
  const task = await taskRecord(store, taskId);
  if (!task) return null;
  const gen = generatorOf(task);
  if (!gen) return { kind: null };
  const cfg = computerFor(store.ownerId);
  if (!cfg) return { ...gen, error: "The computer is not reachable." };
  const folder = await folderOf(cfg, taskId);
  let raw: RawState;
  try {
    raw = await helper<RawState>(cfg, ["state", folder], 30);
  } catch (err) {
    return { ...gen, folder, error: err instanceof Error ? err.message : "The computer could not be read." };
  }
  const state: GeneratorState = { ...gen, folder };
  if (gen.kind === "slides") state.slides = { deck: raw.deck ?? null, updatedAt: raw.updatedAt ?? 0, exports: raw.exports ?? {} };
  else if (gen.kind === "data") state.data = raw.analysis ?? null;
  else if (gen.kind === "audio") state.audio = raw.audio ?? null;
  else if (gen.kind === "research") {
    let confirmed = false;
    if (raw.plan && !raw.progress && !(raw.done ?? []).length) {
      const live = liveRuntime(store, taskId);
      const events = live ? await live.allEvents() : await store.listEvents(taskId);
      confirmed = events.some((e) => e.type === "user.message" && e.text === WIDE_RESEARCH_GO);
    }
    state.research = researchState(raw, task, confirmed);
  }
  return state;
}

/* -------------------------------------------------------------------- deck */

const deckCache = new Map<string, DeckBundle>();

/** The deck with every slide composed into one self-contained HTML document, for the viewer. */
export async function deckBundle(store: Store, taskId: string, version?: string): Promise<DeckBundle | null> {
  const ctx = await generatorTask(store, taskId);
  if (!ctx || ctx.kind !== "slides") return null;
  const key = `${store.ownerId}:${taskId}:${version ?? ""}`;
  if (version && deckCache.has(key)) return deckCache.get(key)!;
  const dest = `/tmp/om-deck-${taskId}-${randomBytes(4).toString("hex")}.json.gz`;
  const made = await helper<{ ok: boolean; error?: string }>(ctx.cfg, ["deck", ctx.folder, dest], 60);
  if (!made.ok) return null;
  let bytes: Buffer;
  try {
    bytes = await readComputerFile(ctx.cfg, dest);
  } catch (err) {
    throw new GeneratorError(err instanceof Error ? err.message : "The deck could not be read.", 502);
  }
  void bash(ctx.cfg, `rm -f ${shellQuote(dest)}`).catch(() => undefined);
  const bundle = JSON.parse(gunzipSync(bytes).toString("utf8")) as DeckBundle;
  if (version) {
    deckCache.set(key, bundle);
    if (deckCache.size > 40) deckCache.delete(deckCache.keys().next().value!);
  }
  return bundle;
}

/** Exports the deck on the computer (Chrome for PDF and PPTX images, python-pptx for PPTX). Returns the file's path in the task folder. */
export async function exportDeck(store: Store, taskId: string, format: ExportFormat): Promise<{ path: string }> {
  const ctx = await generatorTask(store, taskId);
  if (!ctx || ctx.kind !== "slides") throw new GeneratorError("This task has no slide deck.", 404);
  if (format !== "html") {
    const boot = await helper<{ ok: boolean; error?: string }>(ctx.cfg, ["bootstrap"], 240);
    if (!boot.ok) throw new GeneratorError(`The export tools could not be installed: ${boot.error ?? "unknown error"}`, 502);
  }
  const done = await helper<{ ok: boolean; path?: string; error?: string }>(ctx.cfg, ["export", ctx.folder, format], 290);
  if (!done.ok || !done.path) throw new GeneratorError(done.error ?? "The export failed.", 502);
  return { path: done.path };
}

/* ------------------------------------------------------------------- files */

const REL_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w .@+()\-/]{1,400}$/;

export function isSafeRelPath(rel: string): boolean {
  return REL_PATH.test(rel) && !rel.includes("//");
}

/** A file inside a generator task's folder. */
export async function readGeneratorFile(store: Store, taskId: string, rel: string): Promise<{ name: string; bytes: Buffer } | null> {
  if (!isSafeRelPath(rel)) throw new GeneratorError("Invalid path.", 400);
  const ctx = await generatorTask(store, taskId);
  if (!ctx) return null;
  try {
    const bytes = await readComputerFile(ctx.cfg, `${ctx.folder}/${rel}`);
    return { name: rel.split("/").pop() ?? rel, bytes };
  } catch (err) {
    if (err instanceof ComputerError) throw new GeneratorError(err.message, err.status === 404 || err.status === 413 ? err.status : 502);
    throw err;
  }
}
