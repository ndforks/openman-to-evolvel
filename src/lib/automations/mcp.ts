/**
 * A tiny MCP server (Streamable HTTP, stateless JSON responses) that lets the user's Hermes create,
 * list, update and delete their automations. Served at `/api/automations/mcp`.
 *
 * Auth: `Authorization: Bearer <token>`, a per-user token `omauto2_<userId b64url>.<issued>.<nonce>.<mac>`:
 *  - signed with a key derived from SESSION_SECRET for this purpose only, so it opens nothing but this server and
 *    only that user's automations (it is not a session and not an API key);
 *  - expires `TOKEN_TTL_S` after it was issued;
 *  - revocable: every token issued before `revocations.automations_not_before` is refused ("sign out everywhere",
 *    account deletion, `DELETE /api/automations/mcp`);
 *  - rotated: a token older than `ROTATE_AFTER_S` that is used gets a fresh one written to the user's computer
 *    (picked up the next time Hermes restarts; the old one keeps working until it expires). Every setup mints a new one.
 * Calls are rate limited per user. Tokens of the first format (no expiry, no revocation) are refused.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { brand } from "@/config/brand";
import { open as openSealed } from "@/lib/crypto";
import { getAccount } from "@/lib/db/accounts";
import { getAutomation, listAutomations } from "@/lib/db/automations";
import { db } from "@/lib/db/client";
import { getRevocation, setRevocation } from "@/lib/db/revocations";
import type { Session } from "@/lib/session";
import { sessionFor } from "./engine";
import { parseDescription } from "./parse";
import { isValidTimeZone } from "./schedule";
import { AutomationError, createAutomation, describeAutomation, editAutomation, emailTriggersEnabled, removeAutomation, setEnabled, testRun } from "./service";
import { automationInputSchema, repeatRuleSchema, type AutomationInput, type TriggerInput } from "./types";

const PROTOCOL = "2025-06-18";

export const TOKEN_TTL_S = 30 * 24 * 3600;
export const ROTATE_AFTER_S = 7 * 24 * 3600;
const CALLS_PER_MINUTE = 120;
const RUNS_PER_HOUR = 20;

function tokenKey(): Buffer {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s) throw new Error("SESSION_SECRET is not set.");
  return createHmac("sha256", s).update("openman automations-mcp token key v2").digest();
}

const mac = (userId: string, issued: number, nonce: string) => createHmac("sha256", tokenKey()).update(`automations-mcp:v2:${userId}:${issued}:${nonce}`).digest("base64url");

/** A new token for the user (no database write; revocation and expiry are checked when it is used). */
export function mintToken(userId: string, now = Date.now()): string {
  const issued = Math.floor(now / 1000);
  const nonce = randomBytes(12).toString("base64url");
  return `omauto2_${Buffer.from(userId).toString("base64url")}.${issued}.${nonce}.${mac(userId, issued, nonce)}`;
}

/** Signature and expiry only (no database). */
export function parseToken(token: string | null | undefined, now = Date.now()): { userId: string; issued: number } | null {
  const m = token?.match(/^omauto2_([A-Za-z0-9_-]+)\.(\d{9,11})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const userId = Buffer.from(m[1], "base64url").toString("utf8");
  const issued = Number(m[2]);
  if (!userId || !Number.isSafeInteger(issued)) return null;
  const want = Buffer.from(mac(userId, issued, m[3]));
  const got = Buffer.from(m[4]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const age = now / 1000 - issued;
  if (age > TOKEN_TTL_S || age < -300) return null;
  return { userId, issued };
}

/** The user the token belongs to, or null when it is forged, expired or revoked. */
export async function verifyToken(token: string | null | undefined, now = Date.now()): Promise<string | null> {
  const parsed = parseToken(token, now);
  if (!parsed) return null;
  let notBefore: string | null;
  try {
    notBefore = (await getRevocation(parsed.userId)).automationsNotBefore;
  } catch {
    return null; // cannot check revocation: refuse
  }
  if (notBefore && parsed.issued * 1000 < Date.parse(notBefore)) return null;
  if (now / 1000 - parsed.issued > ROTATE_AFTER_S) void rotateToken(parsed.userId).catch((err) => console.warn("[automations-mcp] rotation failed:", err instanceof Error ? err.message : err));
  return parsed.userId;
}

/** Revokes every automations token the user holds. */
export async function revokeTokens(userId: string): Promise<void> {
  await setRevocation(userId, { automations: new Date() });
}

const rotating = new Set<string>();
/** Writes a fresh token into Hermes' config on the user's home computer (no restart: used from the next one). */
export async function rotateToken(userId: string): Promise<boolean> {
  if (rotating.has(userId)) return false;
  rotating.add(userId);
  try {
    const base = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "");
    const account = await getAccount(userId);
    if (!base || !account?.orgoKeyEnc || !account.homeComputerId) return false;
    const { OrgoClient } = await import("@/lib/orgo/user-client");
    const { writeHermesMcp } = await import("@/lib/connectors/server");
    const orgo = new OrgoClient({ apiKey: openSealed(account.orgoKeyEnc), workspaceId: account.workspaceId });
    const entry = { url: `${base}/api/automations/mcp`, headers: { Authorization: `Bearer ${mintToken(userId)}` }, timeout: 120, connect_timeout: 30 };
    await writeHermesMcp(orgo, account.homeComputerId, { automations: entry }, false);
    return true;
  } finally {
    setTimeout(() => rotating.delete(userId), 10 * 60_000);
  }
}

/** Per-user call budget (database, fixed windows). Throws `AutomationError` 429 when spent. */
async function rateLimit(userId: string, bucket: "calls" | "runs"): Promise<void> {
  const seconds = bucket === "calls" ? 60 : 3600;
  const limit = bucket === "calls" ? CALLS_PER_MINUTE : RUNS_PER_HOUR;
  const start = new Date(Math.floor(Date.now() / (seconds * 1000)) * seconds * 1000).toISOString();
  const { data, error } = await db().rpc("api_rate_hit", { p_bucket: `automcp:${bucket}:${userId}`, p_window: start });
  if (error) return; // the database is the source of truth for automations too; a failed counter does not block
  if (Number(data) > limit) throw new AutomationError(bucket === "calls" ? "Too many automation requests. Wait a minute." : `Automations can be run by hand ${RUNS_PER_HOUR} times an hour.`, 429);
}

// The plan decides limits. Background callers have no session, so the last plan seen on a request is kept.
const g = globalThis as typeof globalThis & { __omPlans?: Map<string, string> };
const plans: Map<string, string> = (g.__omPlans ??= new Map());
export function rememberPlan(session: Session): void {
  if (session.plan) plans.set(session.userId, session.plan);
}
function mcpSession(userId: string): Session {
  const s = sessionFor(userId);
  return { ...s, plan: plans.get(userId) ?? s.plan };
}

// ------------------------------------------------------------------ tools

const ruleJson = {
  type: "object",
  description: 'Exact timing, instead of "when". One of: {freq:"once",date:"YYYY-MM-DD",time:"HH:MM"}, {freq:"daily",time}, {freq:"weekdays",time}, {freq:"weekly",days:[0-6, 0=Sunday],time}, {freq:"monthly",dates:[1-31],time}, {freq:"interval",everyMinutes}.',
};

const TOOLS = [
  {
    name: "create_automation",
    description: `Create an automation the user can see on their Automations page. ${brand.agentNoun} will run "instruction" as a new task (or in the same task) at the chosen times or when a trigger fires. Use when the user asks to do something on a schedule ("every weekday at 9", "tomorrow at 3pm", "every Monday") or when something happens (a webhook call, new items in an RSS feed).`,
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string", description: "What to do on each run, written as a task for yourself." },
        when: { type: "string", description: 'Plain-language timing or trigger, e.g. "every weekday at 9am", "on the 1st of every month at 8:00", "every 30 minutes", "when https://example.com/feed.xml posts", "when the webhook is called".' },
        repeat: ruleJson,
        timezone: { type: "string", description: "IANA time zone of the user, e.g. America/Los_Angeles. Defaults to UTC." },
        name: { type: "string", description: "Short name shown on the card." },
        ends_at: { type: "string", description: "ISO date-time after which it stops." },
        run_in: { type: "string", enum: ["new", "same"], description: "new: each run starts a separate task (default). same: each run continues the task of the previous run." },
        mode: { type: "string", enum: Object.keys(brand.modes), description: "Agent mode for runs." },
      },
      required: ["instruction"],
    },
  },
  {
    name: "list_automations",
    description: "List the user's automations with their timing, status and next run.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_automation",
    description: "Change an automation: its instruction, timing, name, or pause/resume it (enabled).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        instruction: { type: "string" },
        when: { type: "string", description: "New plain-language timing." },
        repeat: ruleJson,
        timezone: { type: "string" },
        name: { type: "string" },
        enabled: { type: "boolean", description: "false pauses it, true resumes it." },
        run_in: { type: "string", enum: ["new", "same"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_automation",
    description: "Delete an automation and its run history.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "run_automation_now",
    description: "Start a test run of an automation right away.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function timingFrom(args: Args, tz: string): { repeat: AutomationInput["repeat"]; triggers: TriggerInput[] } | null {
  if (args.repeat) {
    const parsed = repeatRuleSchema.safeParse(args.repeat);
    if (!parsed.success) throw new AutomationError(`repeat: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    return { repeat: parsed.data, triggers: [] };
  }
  const when = str(args.when);
  if (!when) return null;
  const d = parseDescription(when, tz, { emailTriggers: emailTriggersEnabled() });
  if (!d.repeat && d.triggers.length === 0) throw new AutomationError(`Could not understand the timing "${when}". Pass "repeat" with exact fields instead.`);
  return { repeat: d.repeat, triggers: d.triggers };
}

function summaryOf(a: Awaited<ReturnType<typeof listAutomations>>[number]) {
  return { id: a.id, name: a.name, kind: a.kind, instruction: a.prompt, timing: describeAutomation(a), timezone: a.timezone, enabled: a.enabled, paused_reason: a.pausedReason, next_run_at: a.enabled ? a.nextRunAt : null, last_run_at: a.lastRunAt, run_in: a.runIn };
}

async function callTool(userId: string, name: string, args: Args): Promise<unknown> {
  const session = mcpSession(userId);
  switch (name) {
    case "list_automations":
      return { automations: (await listAutomations(userId)).map(summaryOf), page: "/app/automations?tab=manage" };
    case "create_automation": {
      const tz = str(args.timezone) && isValidTimeZone(String(args.timezone)) ? String(args.timezone) : "UTC";
      const timing = timingFrom(args, tz);
      if (!timing) throw new AutomationError('Give "when" (plain language) or "repeat".');
      const input = automationInputSchema.parse({
        name: str(args.name),
        kind: timing.triggers.length ? (timing.triggers.some((t) => t.type !== "timer") ? "trigger" : "advanced") : "schedule",
        prompt: str(args.instruction) ?? "",
        repeat: timing.repeat,
        triggers: timing.triggers,
        timezone: tz,
        endsAt: str(args.ends_at) ?? null,
        runIn: args.run_in === "same" ? "same" : "new",
        mode: str(args.mode) ?? "standard",
      });
      const a = await createAutomation(session, input);
      return { created: summaryOf(a), page: "/app/automations?tab=manage" };
    }
    case "update_automation": {
      const id = str(args.id);
      const a = id ? await getAutomation(userId, id) : null;
      if (!a) throw new AutomationError("Automation not found.", 404);
      const onlyToggle = Object.keys(args).every((k) => k === "id" || k === "enabled");
      if (onlyToggle && typeof args.enabled === "boolean") return { updated: summaryOf(await setEnabled(session, a.id, args.enabled)) };
      const tz = str(args.timezone) && isValidTimeZone(String(args.timezone)) ? String(args.timezone) : a.timezone;
      const timing = timingFrom(args, tz);
      const input = automationInputSchema.parse({
        name: str(args.name) ?? a.name,
        kind: a.kind,
        prompt: str(args.instruction) ?? a.prompt,
        repeat: timing ? timing.repeat : a.repeat,
        triggers: timing ? timing.triggers : a.triggers.map((t) => (t.type === "webhook" ? { id: t.id, type: "webhook", authHeaderName: t.authHeaderName, conditions: t.conditions } : t)),
        timezone: tz,
        endsAt: a.endsAt,
        runIn: args.run_in === "same" || args.run_in === "new" ? args.run_in : a.runIn,
        mode: a.mode,
        projectId: a.projectId,
        connectors: a.connectors,
        enabled: typeof args.enabled === "boolean" ? args.enabled : a.enabled,
      });
      return { updated: summaryOf(await editAutomation(session, a.id, input)) };
    }
    case "delete_automation": {
      const id = str(args.id);
      if (!id || !(await removeAutomation(session, id))) throw new AutomationError("Automation not found.", 404);
      return { deleted: id };
    }
    case "run_automation_now": {
      const id = str(args.id);
      if (!id) throw new AutomationError("Give the automation id.");
      await rateLimit(userId, "runs");
      const run = await testRun(session, id);
      return { run_id: run.id, task_id: run.taskId, status: run.status };
    }
    default:
      throw new AutomationError(`Unknown tool ${name}.`, 404);
  }
}

// ------------------------------------------------------------------ JSON-RPC

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

async function handleOne(userId: string, req: RpcRequest): Promise<unknown | null> {
  const id = req.id ?? null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (req.id === undefined) return null; // notification
  switch (req.method) {
    case "initialize":
      return reply({
        protocolVersion: typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "automations", version: "1.0.0" },
        instructions: `Manage the user's ${brand.name} automations (scheduled or triggered tasks). Created automations appear on the Automations page.`,
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments as Args | undefined) ?? {};
      try {
        await rateLimit(userId, "calls");
        const result = await callTool(userId, name, args);
        return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false });
      } catch (err) {
        const message = err instanceof AutomationError ? err.message : err instanceof Error ? err.message : String(err);
        return reply({ content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return error(-32601, `Method not found: ${req.method}`);
  }
}

/** The automation tools for the `omtools` bridge on the user's computer (no token involved: the relay calls this as the task's owner). */
export const AUTOMATION_TOOL_NAMES = ["create_automation", "list_automations", "update_automation", "delete_automation", "run_automation_now"] as const;
export const AUTOMATION_TOOLS = TOOLS;
export async function runAutomationTool(userId: string, name: string, args: Args): Promise<{ text: string; error?: boolean }> {
  if (!(AUTOMATION_TOOL_NAMES as readonly string[]).includes(name)) return { text: JSON.stringify({ error: `Unknown tool ${name}.` }), error: true };
  try {
    await rateLimit(userId, "calls");
    return { text: JSON.stringify(await callTool(userId, name, args), null, 1) };
  } catch (err) {
    return { text: JSON.stringify({ error: err instanceof AutomationError ? err.message : "The automation could not be changed." }), error: true };
  }
}

export async function handleRpc(userId: string, body: unknown): Promise<unknown | null> {
  if (Array.isArray(body)) {
    if (body.length > 20) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "At most 20 requests per batch." } };
    const out = (await Promise.all(body.map((b) => handleOne(userId, b as RpcRequest)))).filter((r) => r !== null);
    return out.length ? out : null;
  }
  return handleOne(userId, (body ?? {}) as RpcRequest);
}

/** What provisioning writes into the user's Hermes config (`~/.hermes/config.yaml`). */
export function hermesConfigBlock(url: string, tokenValue: string): string {
  return ["mcp_servers:", "  automations:", `    url: "${url}"`, "    headers:", `      Authorization: "Bearer ${tokenValue}"`].join("\n");
}
