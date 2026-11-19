/**
 * Full-stack features of a site, all on the user's own Orgo computer. Server only.
 * - Database browser: one parameterised helper (`kit/dbtool.py`) runs every read and write against the site's SQLite file.
 * - Analytics: the published runtime's page-view log (`.openman/analytics.db`), summarised by the same helper.
 * - Secrets: sealed in `website_secrets`, written to the site's `.env` (see `writeSiteEnv`).
 * - Scheduled jobs: kept in the site's meta, mirrored to the computer, run by the published runtime.
 * - Custom domains: Orgo's own custom-domain API for the user's plan.
 */
import { randomUUID } from "node:crypto";
import { seal } from "@/lib/crypto";
import { deleteWebsiteSecret, getWebsiteRow, listWebsiteSecrets, putWebsiteSecret, updateWebsiteRow, type WebsiteRow } from "@/lib/db/websites";
import { OrgoError } from "@/lib/orgo/user-client";
import type { Session } from "@/lib/session";
import { KIT_DIR } from "./contract";
import { ctxFor, ensureKit, isSiteFolder, patchMeta, q, SECRET_NAME, sh, SiteError, writeSchedules, writeSiteEnv, type Ctx } from "./server";
import type { DomainsState, ScheduleRun, SiteAnalytics, SiteDomain, SiteSchedule, SiteSecret } from "./types";

/* ---------------------------------------------------------------- database helper */

export type DbRequest =
  | { op: "tables" }
  | { op: "schema"; table: string }
  | { op: "rows"; table: string; limit?: number; offset?: number }
  | { op: "insert"; table: string; values: Record<string, string | number | boolean | null> }
  | { op: "update"; table: string; rowid: number; values: Record<string, string | number | boolean | null> }
  | { op: "delete"; table: string; rowid: number }
  | { op: "analytics"; days: number };

/** Runs one request through the helper. The request goes base64-encoded as one argument: no SQL is ever built here. */
async function runTool<T>(ctx: Ctx, row: WebsiteRow, req: DbRequest): Promise<T> {
  if (!isSiteFolder(row.folder)) throw new SiteError("This site has no folder yet.", 409);
  await ensureKit(ctx);
  const b64 = Buffer.from(JSON.stringify(req)).toString("base64");
  const r = await sh(ctx, `python3 ${KIT_DIR}/dbtool.py ${q(row.folder)} ${q(b64)}`, 60);
  const line = r.out.trim().split("\n").pop() ?? "";
  let body: (T & { error?: string }) | null = null;
  try {
    body = JSON.parse(line) as T & { error?: string };
  } catch {
    body = null;
  }
  if (!body) throw new SiteError("The database helper did not answer.", 502);
  if (body.error && (body as { code?: string }).code !== "no_db") throw new SiteError(body.error, 400);
  return body;
}

export async function databaseRequest(session: Session, row: WebsiteRow, req: Exclude<DbRequest, { op: "analytics" }>): Promise<unknown> {
  return runTool(await ctxFor(session, row), row, req);
}

export async function siteAnalytics(session: Session, row: WebsiteRow, days: number): Promise<SiteAnalytics> {
  return runTool<SiteAnalytics>(await ctxFor(session, row), row, { op: "analytics", days });
}

/* ---------------------------------------------------------------- secrets */

/** Rewrites the env file now when the computer is awake; otherwise marks it for the next start. */
async function pushEnv(session: Session, row: WebsiteRow): Promise<"written" | "pending"> {
  const fresh = (await getWebsiteRow(session.userId, row.id)) ?? row;
  try {
    await writeSiteEnv(await ctxFor(session, fresh), fresh);
    return "written";
  } catch (err) {
    if (!(err instanceof SiteError && err.status === 503)) throw err;
    await updateWebsiteRow(session.userId, row.id, { meta: patchMeta(fresh, { envDirty: true }) });
    return "pending";
  }
}

export async function listSecrets(session: Session, row: WebsiteRow): Promise<SiteSecret[]> {
  return listWebsiteSecrets(session.userId, row.id);
}

export async function setSecret(session: Session, row: WebsiteRow, name: string, value: string): Promise<{ secrets: SiteSecret[]; env: "written" | "pending" }> {
  const n = name.trim().toUpperCase();
  if (!SECRET_NAME.test(n)) throw new SiteError("Use capital letters, digits and underscores for the name (for example STRIPE_KEY).", 400);
  if (n.startsWith("OM_") || n === "PORT") throw new SiteError("That name is reserved.", 400);
  if (!value) throw new SiteError("Enter a value.", 400);
  if (value.length > 8192) throw new SiteError("That value is too long (8,192 characters at most).", 400);
  const existing = await listWebsiteSecrets(session.userId, row.id);
  if (existing.length >= 50 && !existing.some((s) => s.name === n)) throw new SiteError("A site can keep 50 secrets.", 400);
  await putWebsiteSecret(session.userId, row.id, n, seal(value));
  const env = await pushEnv(session, row);
  return { secrets: await listWebsiteSecrets(session.userId, row.id), env };
}

export async function removeSecret(session: Session, row: WebsiteRow, name: string): Promise<{ secrets: SiteSecret[]; env: "written" | "pending" }> {
  await deleteWebsiteSecret(session.userId, row.id, name);
  const env = await pushEnv(session, row);
  return { secrets: await listWebsiteSecrets(session.userId, row.id), env };
}

/** The AI switch lives in the env file too (OM_AI_ENABLED). */
export async function setAiEnabled(session: Session, row: WebsiteRow, enabled: boolean): Promise<WebsiteRow> {
  const next = (await updateWebsiteRow(session.userId, row.id, { meta: patchMeta(row, { aiEnabled: enabled }) })) ?? row;
  await pushEnv(session, next);
  return next;
}

/* ---------------------------------------------------------------- scheduled jobs */

const CRON_FIELD = /^(\*|\d{1,2}(-\d{1,2})?)(\/\d{1,2})?(,(\*|\d{1,2}(-\d{1,2})?)(\/\d{1,2})?)*$/;
export function validCron(expr: string): boolean {
  const f = expr.trim().split(/\s+/);
  return f.length === 5 && f.every((x) => CRON_FIELD.test(x));
}

export async function listSchedules(session: Session, row: WebsiteRow): Promise<{ schedules: SiteSchedule[]; runs: ScheduleRun[]; active: boolean }> {
  const schedules = row.meta?.schedules ?? [];
  let runs: ScheduleRun[] = [];
  if (isSiteFolder(row.folder)) {
    const r = await sh(await ctxFor(session, row), `tail -n 60 ${q(row.folder)}/.openman/cron-runs.jsonl 2>/dev/null`, 20).catch(() => ({ out: "", code: 1 }));
    runs = r.out
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l) as ScheduleRun;
        } catch {
          return null;
        }
      })
      .filter((x): x is ScheduleRun => !!x && typeof x.job === "string")
      .reverse();
  }
  return { schedules, runs, active: row.status === "published" };
}

export type ScheduleInput = Omit<SiteSchedule, "id"> & { id?: string };

export async function saveSchedules(session: Session, row: WebsiteRow, input: ScheduleInput[]): Promise<SiteSchedule[]> {
  if (input.length > 20) throw new SiteError("A site can have 20 scheduled jobs.", 400);
  const schedules: SiteSchedule[] = input.map((j) => {
    const name = String(j.name ?? "").trim().slice(0, 80);
    const cron = String(j.cron ?? "").trim();
    const command = String(j.command ?? "").trim();
    if (!name) throw new SiteError("Give each job a name.", 400);
    if (!validCron(cron)) throw new SiteError(`"${cron}" is not a schedule like "0 9 * * *" (minute hour day month weekday).`, 400);
    if (!command || command.length > 2000) throw new SiteError("Each job needs a command (2,000 characters at most).", 400);
    return { id: j.id && /^[a-z0-9-]{8,40}$/.test(j.id) ? j.id : randomUUID().slice(0, 12), name, cron, command, enabled: j.enabled !== false };
  });
  const next = (await updateWebsiteRow(session.userId, row.id, { meta: patchMeta(row, { schedules }) })) ?? row;
  try {
    await writeSchedules(await ctxFor(session, next), next);
  } catch (err) {
    // A sleeping computer gets the jobs at the next publish.
    if (!(err instanceof SiteError && err.status === 503)) throw err;
  }
  return schedules;
}

export async function runScheduleNow(session: Session, row: WebsiteRow, id: string): Promise<void> {
  if (row.status !== "published") throw new SiteError("Publish the site first: jobs run inside the published site.", 409);
  const job = (row.meta?.schedules ?? []).find((j) => j.id === id);
  if (!job || !isSiteFolder(row.folder)) throw new SiteError("Unknown job.", 404);
  await sh(await ctxFor(session, row), `mkdir -p ${q(row.folder)}/.openman/cron-now && touch ${q(`${row.folder}/.openman/cron-now/${job.id}`)}`, 20);
}

/* ---------------------------------------------------------------- custom domains (Orgo) */

interface OrgoDomain {
  id: string;
  domain: string;
  status: string;
  target_port: number | null;
  cert_status?: string | null;
  dns_records?: { type: string; name: string; host: string; value: string }[];
}
interface OrgoDomainList {
  enabled: boolean;
  limit: number;
  used: number;
  can_edit?: boolean;
  domains: OrgoDomain[];
}

const present = (d: OrgoDomain): SiteDomain => ({
  id: d.id,
  domain: d.domain,
  status: d.status,
  targetPort: d.target_port,
  certStatus: d.cert_status ?? null,
  records: (d.dns_records ?? []).map((r) => ({ type: r.type, name: r.name, host: r.host, value: r.value })),
});

const domainsPath = (ctx: Ctx) => `/computers/${encodeURIComponent(ctx.computerId)}/domains`;

/** `available` is false (and the UI renders nothing) unless Orgo lets this user add a domain on this computer. */
export async function listDomains(session: Session, row: WebsiteRow): Promise<DomainsState> {
  const ctx = await ctxFor(session, row);
  let list: OrgoDomainList;
  try {
    list = await ctx.client.request<OrgoDomainList>("GET", domainsPath(ctx));
  } catch (err) {
    if (err instanceof OrgoError && err.status >= 400 && err.status < 500) return { available: false, limit: 0, used: 0, domains: [] };
    throw err;
  }
  const mine = (list.domains ?? []).filter((d) => d.target_port === row.prod_port);
  const available = !!list.enabled && list.can_edit !== false && list.limit !== 0;
  return { available, limit: list.limit, used: list.used, domains: mine.map(present) };
}

export async function addDomain(session: Session, row: WebsiteRow, domain: string): Promise<SiteDomain> {
  const state = await listDomains(session, row);
  if (!state.available) throw new SiteError("Custom domains are not included on your Orgo plan.", 403);
  if (!row.prod_port) throw new SiteError("This site has no address yet.", 409);
  const name = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) throw new SiteError("Enter a domain like www.example.com.", 400);
  const ctx = await ctxFor(session, row);
  const access = row.visibility === "public" ? "link" : "team";
  const made = await ctx.client.request<OrgoDomain>("POST", domainsPath(ctx), { domain: name, target_port: row.prod_port, access });
  return present(made);
}

export async function verifyDomain(session: Session, row: WebsiteRow, domainId: string): Promise<{ status: string; message: string | null; records?: SiteDomain["records"] }> {
  const ctx = await ctxFor(session, row);
  await ownDomain(ctx, row, domainId);
  try {
    const r = await ctx.client.request<{ status: string }>("POST", `${domainsPath(ctx)}/${encodeURIComponent(domainId)}/verify`);
    return { status: r.status, message: null };
  } catch (err) {
    if (err instanceof OrgoError && err.status === 409) return { status: "verifying", message: err.message };
    throw err;
  }
}

export async function removeDomain(session: Session, row: WebsiteRow, domainId: string): Promise<void> {
  const ctx = await ctxFor(session, row);
  await ownDomain(ctx, row, domainId);
  await ctx.client.request("DELETE", `${domainsPath(ctx)}/${encodeURIComponent(domainId)}`);
}

/** The domain must point at this site's port on this computer (no acting on another site's domain). */
async function ownDomain(ctx: Ctx, row: WebsiteRow, domainId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(domainId)) throw new SiteError("Unknown domain.", 404);
  const list = await ctx.client.request<OrgoDomainList>("GET", domainsPath(ctx));
  if (!(list.domains ?? []).some((d) => d.id === domainId && d.target_port === row.prod_port)) throw new SiteError("Unknown domain.", 404);
}
