/**
 * Outgoing webhooks: which events exist, who receives them, signing, delivery with retries.
 *
 * Events come from two places:
 * - API calls that cause them (task created or deleted through `/api/v1`) emit at once.
 * - Everything else is read from the stored event log: `scanEvents()` reads `status` events
 *   (completed, stopped, error, waiting) and new task rows since its cursor, for owners with at least one
 *   enabled endpoint. The relay is not touched; every event has a deterministic id, so a rescan never
 *   delivers twice (unique per endpoint and event).
 *
 * Who drives it: `processOutbox()`, called by `POST /api/v1/cron/webhooks` (CRON_SECRET), by a small
 * in-process ticker that runs every 10 s while the API is in use, and (once wired) by `/api/cron/tick`.
 */
import { createHmac, createHash } from "node:crypto";
import { brand } from "@/config/brand";
import { assertPublicUrl, FetchLimitError, safeFetch, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { logEvent } from "@/lib/observability/log"; // [observability]
import type { AgentEvent, TaskStatus } from "@/lib/agent/types";
import {
  apiTasksFor,
  dueDeliveries,
  enabledEndpoints,
  endpointSecret,
  knownEventIds,
  leaseDelivery,
  pruneApiTables,
  queueDeliveries,
  recordAttempt,
  scannedTo,
  setScannedTo,
  statusEventsSince,
  tasksCreatedSince,
  usersWithEndpoints,
  type Delivery,
} from "@/lib/db/public-api";
import { toSummary } from "@/lib/store/types";
import { ownerStore } from "./owner";
import { advanceStructured, EXTRACTION_MARK } from "./structured";
import { finalMessage, pendingRequest, taskView } from "./views";

export const PUBLIC_EVENTS = ["task.created", "task.completed", "task.failed", "task.stopped", "task.needs_input", "task.deleted"] as const;
export type PublicEventType = (typeof PUBLIC_EVENTS)[number] | "ping";

/** Events only the public API knows; an endpoint naming any of them is matched exactly. */
const FINE_GRAINED = new Set(["task.completed", "task.failed", "task.needs_input"]);

/**
 * Whether an endpoint receives an event. Endpoints made in Settings know three events
 * (`task.created`, `task.stopped`, `task.deleted`); for them `task.stopped` means "the task stopped
 * running for any reason", so it also covers completed, failed and needs-input.
 * An endpoint that lists a fine-grained event, or `*`, is matched exactly.
 */
export function receives(events: string[], type: string): boolean {
  if (type === "ping") return true;
  if (events.includes("*") || events.includes(type)) return true;
  const fine = events.some((e) => FINE_GRAINED.has(e));
  return !fine && events.includes("task.stopped") && FINE_GRAINED.has(type);
}

export const eventIdFor = (key: string) => `evt_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;

/* ------------------------------------------------------------------ signing */

export const SIGNATURE_HEADER = "Webhook-Signature";
export const TIMESTAMP_HEADER = "Webhook-Timestamp";
export const ID_HEADER = "Webhook-Id";

/** `v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>` */
export function sign(secret: string, timestamp: number, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/* ------------------------------------------------------------------ emitting */

/** Queues an event for every enabled endpoint of the user that receives it. Returns how many were queued. */
export async function emit(userId: string, key: string, type: PublicEventType, data: Record<string, unknown>, onlyEndpoint?: string): Promise<number> {
  const endpoints = (await enabledEndpoints(userId)).filter((e) => (onlyEndpoint ? e.id === onlyEndpoint : receives(e.events, type)));
  if (!endpoints.length) return 0;
  const id = eventIdFor(key);
  const payload = { id, object: "event", type, created_at: new Date().toISOString(), data };
  const queued = await queueDeliveries(endpoints.map((e) => ({ webhookId: e.id, userId, eventId: id, eventType: type, payload })));
  if (queued) void deliverDue().catch(() => undefined);
  return queued;
}

const STATUS_EVENT: Partial<Record<TaskStatus, PublicEventType>> = { completed: "task.completed", error: "task.failed", stopped: "task.stopped", waiting: "task.needs_input" };

/** The data block for a task event, built from the task's current record and its events. */
export async function taskEventData(userId: string, taskId: string, extra: { status?: TaskStatus; brief?: string | null; seq?: number } = {}): Promise<Record<string, unknown> | null> {
  const store = await ownerStore(userId);
  const record = await store.getTask(taskId);
  if (!record) return null;
  const api = (await apiTasksFor(userId, [taskId])).get(taskId) ?? null;
  const view = taskView(toSummary(record), api);
  const data: Record<string, unknown> = { task: view };
  if (extra.seq !== undefined) data.seq = extra.seq;
  if (extra.brief) data.brief = extra.brief;
  if (extra.status === "completed" || extra.status === "waiting" || extra.status === "error") {
    let events: AgentEvent[] = await store.listEvents(taskId);
    if (extra.seq !== undefined) events = events.filter((e) => e.seq <= extra.seq!);
    if (extra.status === "completed") {
      // For a task with an output schema, the answer is the last message before the extraction turn.
      const ask = events.find((e) => e.type === "user.message" && e.text.startsWith(EXTRACTION_MARK));
      data.result = { message: finalMessage(ask ? events.filter((e) => e.seq < ask.seq) : events)?.text ?? null };
    }
    if (extra.status === "waiting") data.pending_request = pendingRequest(events, "waiting");
    if (extra.status === "error") data.error = { message: extra.brief ?? "The task failed." };
  }
  return data;
}

/* ------------------------------------------------------------------ scanning */

const OVERLAP_MS = 5 * 60_000;
const FIRST_LOOKBACK_MS = 10 * 60_000;

export async function scanEvents(): Promise<{ queued: number }> {
  const until = new Date().toISOString();
  const users = await usersWithEndpoints();
  if (!users.length) {
    await setScannedTo(until);
    return { queued: 0 };
  }
  const cursor = (await scannedTo()) ?? new Date(Date.now() - FIRST_LOOKBACK_MS).toISOString();
  const since = new Date(Date.parse(cursor) - OVERLAP_MS).toISOString();
  let queued = 0;

  const [created, statuses] = await Promise.all([tasksCreatedSince(users, since), statusEventsSince(users, since)]);

  // Group candidate events per user so known ones are skipped with one query each.
  type Candidate = { userId: string; taskId: string; key: string; type: PublicEventType; status?: TaskStatus; brief?: string | null; seq?: number };
  const candidates: Candidate[] = created.map((c) => ({ userId: c.userId, taskId: c.taskId, key: `${c.taskId}:created`, type: "task.created" }));
  for (const s of statuses) {
    const type = STATUS_EVENT[s.status as TaskStatus];
    if (!type) continue;
    candidates.push({ userId: s.userId, taskId: s.taskId, key: `${s.taskId}:${s.seq}`, type, status: s.status as TaskStatus, brief: s.brief, seq: s.seq });
  }
  const byUser = new Map<string, Candidate[]>();
  for (const c of candidates) byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);

  for (const [userId, list] of byUser) {
    const known = await knownEventIds(
      userId,
      list.map((c) => eventIdFor(c.key)),
    );
    const fresh = list.filter((c) => !known.has(eventIdFor(c.key)));
    if (!fresh.length) continue;
    const map = await apiTasksFor(userId, [...new Set(fresh.map((c) => c.taskId))]);
    for (const c of fresh) {
      // Completions of a task with an output schema are announced by the structured-output step instead.
      const api = map.get(c.taskId);
      if (c.type === "task.completed" && api?.outputSchema) {
        if (api.structuredState === "pending" || api.structuredState === "requested") continue;
        if (c.seq !== undefined && api.structuredRequestSeq !== null && c.seq <= api.structuredRequestSeq) continue;
      }
      try {
        const data = await taskEventData(userId, c.taskId, { status: c.status, brief: c.brief, seq: c.seq });
        if (data) queued += await emit(userId, c.key, c.type, data);
      } catch (err) {
        console.warn(`[api/v1] could not emit ${c.type} for ${c.taskId}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  // When a page was full, resume from its last row next time instead of skipping past it.
  const last = statuses.length >= 1000 ? statuses[statuses.length - 1].at : until;
  await setScannedTo(last);
  return { queued };
}

/* ------------------------------------------------------------------ delivery */

/** Seconds before attempt n+1 after a failed attempt n (1-based); after the last, the delivery fails. */
export const BACKOFF_S = [10, 60, 300, 1800, 7200, 21600];
export const MAX_ATTEMPTS = BACKOFF_S.length + 1;
const TIMEOUT_MS = 10_000;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Plain http and private hosts are allowed only outside production (local receivers while developing). Format check only. */
export function urlAllowed(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Enter a full URL.";
  }
  const prod = process.env.NODE_ENV === "production";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && !prod && PRIVATE_HOST.test(u.hostname))) return "Use an https:// URL.";
  if (prod && PRIVATE_HOST.test(u.hostname)) return "Webhook URLs must be public.";
  if (u.username || u.password) return "Do not put credentials in the URL.";
  return null;
}

/** `urlAllowed` plus DNS: in production every address the host resolves to must be public. */
export async function webhookUrlProblem(raw: string): Promise<string | null> {
  const bad = urlAllowed(raw);
  if (bad) return bad;
  try {
    await assertPublicUrl(raw, { allowPrivate: process.env.NODE_ENV !== "production" });
    return null;
  } catch (err) {
    return err instanceof UnsafeUrlError ? "Webhook URLs must be public." : "Enter a full URL.";
  }
}

async function attempt(d: Delivery): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const target = await endpointSecret(d.webhookId);
  if (!target) return { ok: false, status: null, error: "The endpoint is gone or its secret cannot be read." };
  if (!target.enabled) return { ok: false, status: null, error: "The endpoint is disabled." };
  const bad = urlAllowed(target.url);
  if (bad) return { ok: false, status: null, error: bad };
  const body = JSON.stringify(d.payload);
  const ts = Math.floor(Date.now() / 1000);
  try {
    // safeFetch resolves and pins the host (public addresses only in production) and does not follow redirects.
    const res = await safeFetch(target.url, {
      method: "POST",
      maxRedirects: 0,
      maxBytes: 64 * 1024,
      timeoutMs: TIMEOUT_MS,
      allowPrivate: process.env.NODE_ENV !== "production",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `${brand.name}-Webhooks/1.0`,
        [ID_HEADER]: d.eventId,
        [TIMESTAMP_HEADER]: String(ts),
        [SIGNATURE_HEADER]: sign(target.secret, ts, body),
        "Webhook-Event": d.eventType,
        "Webhook-Attempt": String(d.attempts + 1),
      },
      body,
    });
    return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status, error: null } : { ok: false, status: res.status, error: `Endpoint answered ${res.status}.` };
  } catch (err) {
    if (err instanceof UnsafeUrlError) return { ok: false, status: null, error: "Webhook URLs must be public." };
    if (err instanceof FetchLimitError) return { ok: false, status: null, error: err.code === "timeout" ? `No answer within ${TIMEOUT_MS / 1000} s.` : err.message };
    return { ok: false, status: null, error: "The endpoint could not be reached." };
  }
}

/** Sends one delivery now and records the outcome with the next retry time. */
export async function deliverOne(d: Delivery): Promise<"delivered" | "retry" | "failed"> {
  const r = await attempt(d);
  const attempts = d.attempts + 1;
  if (r.ok) {
    await recordAttempt(d.id, { status: "delivered", attempts, lastStatus: r.status, lastError: null });
    return "delivered";
  }
  const final = attempts >= MAX_ATTEMPTS || r.error === "The endpoint is gone or its secret cannot be read.";
  await recordAttempt(d.id, {
    status: final ? "failed" : "pending",
    attempts,
    nextAttemptAt: final ? undefined : new Date(Date.now() + BACKOFF_S[attempts - 1] * 1000).toISOString(),
    lastStatus: r.status,
    lastError: r.error,
  });
  // [observability] A delivery that gave up is an operator event (no URL, no payload).
  if (final) void logEvent("warn", "webhook.delivery_failed", { userId: d.userId, data: { attempts, status: r.status, eventType: d.eventType } });
  return final ? "failed" : "retry";
}

const g = globalThis as typeof globalThis & { __omApiDelivering?: Promise<DeliverResult> | null };
type DeliverResult = { delivered: number; retrying: number; failed: number };

/** Delivers everything due. One pass at a time per process; leases keep processes from colliding. */
export function deliverDue(): Promise<DeliverResult> {
  g.__omApiDelivering ??= (async () => {
    const result: DeliverResult = { delivered: 0, retrying: 0, failed: 0 };
    try {
      const due = await dueDeliveries(50);
      await Promise.all(
        due.map(async (d) => {
          if (!(await leaseDelivery(d, TIMEOUT_MS + 20_000))) return;
          const outcome = await deliverOne(d);
          if (outcome === "delivered") result.delivered++;
          else if (outcome === "retry") result.retrying++;
          else result.failed++;
        }),
      );
    } finally {
      g.__omApiDelivering = null;
    }
    return result;
  })();
  return g.__omApiDelivering;
}

/* ------------------------------------------------------------------ the pass */

export interface OutboxResult {
  at: string;
  structured: number;
  queued: number;
  delivered: number;
  retrying: number;
  failed: number;
  errors: string[];
}

let lastPrune = 0;

/** One pass: structured outputs owed, new events, due deliveries. Safe to call concurrently. */
export async function processOutbox(): Promise<OutboxResult> {
  const result: OutboxResult = { at: new Date().toISOString(), structured: 0, queued: 0, delivered: 0, retrying: 0, failed: 0, errors: [] };
  const note = (where: string) => (err: unknown) => void result.errors.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
  await advanceStructured()
    .then((n) => (result.structured = n))
    .catch(note("structured"));
  await scanEvents()
    .then((r) => (result.queued = r.queued))
    .catch(note("scan"));
  await deliverDue()
    .then((r) => Object.assign(result, r))
    .catch(note("deliver"));
  if (Date.now() - lastPrune > 10 * 60_000) {
    lastPrune = Date.now();
    await pruneApiTables().catch(note("prune"));
  }
  return result;
}

/* ------------------------------------------------------------------ in-process ticker */

const ticker = globalThis as typeof globalThis & { __omApiTicker?: { timer: ReturnType<typeof setInterval>; lastUse: number; running: boolean }; __omApiPass?: () => Promise<unknown> };
// Re-pointed on every module load, so a hot reload runs the current code.
ticker.__omApiPass = processOutbox;

const TICK_MS = 10_000;
const IDLE_STOP_MS = 15 * 60_000;

/** Called on every API request: keeps a 10 s outbox ticker alive while the API is in use. */
export function kickWorker(): void {
  const now = Date.now();
  if (ticker.__omApiTicker) {
    ticker.__omApiTicker.lastUse = now;
    return;
  }
  const state = { lastUse: now, running: false, timer: undefined as unknown as ReturnType<typeof setInterval> };
  state.timer = setInterval(() => {
    if (Date.now() - state.lastUse > IDLE_STOP_MS) {
      clearInterval(state.timer);
      if (ticker.__omApiTicker === state) ticker.__omApiTicker = undefined;
      return;
    }
    if (state.running) return;
    state.running = true;
    void (ticker.__omApiPass ?? processOutbox)()
      .catch((err) => console.warn("[api/v1] outbox pass failed:", err instanceof Error ? err.message : err))
      .finally(() => (state.running = false));
  }, TICK_MS);
  ticker.__omApiTicker = state;
}
