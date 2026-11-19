/**
 * Structured operator log. One call, one JSON line on stdout; warnings and errors also become a row in `ops_events`
 * (read by `/app/admin`, the deep health check and the alerts). Server only.
 *
 *   logEvent("error", "provision.failed", { userId, error: err, durationMs: 41_000, data: { step: "publish" } });
 *
 * Every field passes the redaction pass (`redact.ts`) first. The user id is never written: only `user`, a keyed
 * hash of it (stable per environment, so one person's events can be grouped without knowing who they are).
 */
import { createHmac, randomBytes } from "node:crypto";
import { db, dbConfigured } from "@/lib/db/client";
import { redact, redactString } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  userId?: string | null;
  taskId?: string | null;
  requestId?: string | null;
  durationMs?: number | null;
  /** The thrown value; only its class and a redacted message are kept. */
  error?: unknown;
  /** One short sentence for a human. Redacted. */
  message?: string;
  /** Small structured detail. Credential-looking fields are dropped; strings are masked. */
  data?: Record<string, unknown>;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = (): number => LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? "info"] ?? LEVELS.info;

/** Keyed hash of a user id (16 hex). The key is `OPS_HASH_KEY`, else `SESSION_SECRET`; it is never written anywhere. */
export function hashUser(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const key = process.env.OPS_HASH_KEY || process.env.SESSION_SECRET || "openman-ops";
  return createHmac("sha256", key).update(`user:${userId}`).digest("hex").slice(0, 16);
}

export function errorClass(err: unknown): string | null {
  if (err === undefined || err === null) return null;
  if (err instanceof Error) return err.constructor?.name && err.constructor.name !== "Error" ? err.constructor.name : err.name || "Error";
  if (typeof Response !== "undefined" && err instanceof Response) return `Response${err.status}`;
  return typeof err;
}

function errorMessage(err: unknown): string | null {
  if (err === undefined || err === null) return null;
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
  return redactString(raw ?? "", 500);
}

/** A short request id: 12 hex characters, unique enough to find one failure in the log. */
export function newRequestId(): string {
  return randomBytes(6).toString("hex");
}

export interface LogLine {
  t: string;
  level: LogLevel;
  event: string;
  user?: string | null;
  task?: string | null;
  req?: string | null;
  ms?: number | null;
  err?: string | null;
  msg?: string | null;
  data?: Record<string, unknown>;
}

/** Builds the redacted line without writing it (tests and the alert webhook use this). */
export function buildLine(level: LogLevel, event: string, f: LogFields = {}): LogLine {
  const line: LogLine = { t: new Date().toISOString(), level, event: event.slice(0, 80) };
  const user = hashUser(f.userId);
  if (user) line.user = user;
  if (f.taskId) line.task = String(f.taskId).slice(0, 80);
  if (f.requestId) line.req = f.requestId;
  if (typeof f.durationMs === "number" && Number.isFinite(f.durationMs)) line.ms = Math.round(f.durationMs);
  const cls = errorClass(f.error);
  if (cls) line.err = cls;
  const msg = f.message ? redactString(f.message, 500) : errorMessage(f.error);
  if (msg) line.msg = msg;
  if (f.data && Object.keys(f.data).length) line.data = redact(f.data);
  return line;
}

const DB_TIMEOUT_MS = 3000;

async function persist(line: LogLine): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await db()
      .from("ops_events")
      .insert({
        at: line.t,
        level: line.level,
        event: line.event,
        user_hash: line.user ?? null,
        task_id: line.task ?? null,
        request_id: line.req ?? null,
        duration_ms: line.ms ?? null,
        error_class: line.err ?? null,
        message: line.msg ?? null,
        data: line.data ?? null,
      })
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
  } catch {
    // The log must never take a request down; stdout already has the line.
  }
}

/**
 * Writes one event. Returns a promise that settles once a warning or error is stored (callers rarely need to wait;
 * route wrappers and the cron tick do, so the row exists before the response).
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): Promise<void> {
  if (LEVELS[level] < minLevel() && level !== "warn" && level !== "error") return Promise.resolve();
  const line = buildLine(level, event, fields);
  try {
    process.stdout.write(`${JSON.stringify(line)}\n`);
  } catch {
    console.log(JSON.stringify(line));
  }
  return level === "warn" || level === "error" ? persist(line) : Promise.resolve();
}

export const log = {
  debug: (event: string, f?: LogFields) => logEvent("debug", event, f),
  info: (event: string, f?: LogFields) => logEvent("info", event, f),
  warn: (event: string, f?: LogFields) => logEvent("warn", event, f),
  error: (event: string, f?: LogFields) => logEvent("error", event, f),
};

/** Times `fn`, logs `<event>` (info) or `<event>.failed` (error) with the duration, and rethrows. */
export async function timedEvent<T>(event: string, fields: Omit<LogFields, "durationMs" | "error">, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    const out = await fn();
    void logEvent("info", event, { ...fields, durationMs: Date.now() - t });
    return out;
  } catch (err) {
    await logEvent("error", `${event}.failed`, { ...fields, durationMs: Date.now() - t, error: err });
    throw err;
  }
}
