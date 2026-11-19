/**
 * Data layer for the public developer API (`/api/v1`) and outgoing webhooks. Server only.
 *
 * Tables (migration `public_api`, applied through the Supabase MCP on 2026-11-19; server-only RLS like the rest):
 * - `api_rate_limits (bucket, window_start, count)`: fixed one-minute windows, bumped by `api_rate_hit()`.
 * - `api_idempotency (user_id, key, fingerprint, status, response)`: replayed answers for `Idempotency-Key`.
 * - `api_tasks (task_id, user_id, api_key_id, output_schema, structured_*)`: tasks created through the API.
 * - `webhook_deliveries (webhook_id, event_id, payload, status, attempts, next_attempt_at, ...)`: the outbox.
 * - `api_outbox_state (id, scanned_to)`: how far the event scanner has read `task_events`.
 * Reads `api_keys` and `webhooks` (owned by Settings → Developers) with the same hashing and sealing.
 */
import { createHash, randomBytes } from "node:crypto";
import { open, seal } from "@/lib/crypto";
import { db, fail, iso } from "./client";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/* ------------------------------------------------------------------ API keys */

export interface KeyOwner {
  keyId: string;
  userId: string;
  name: string;
  lastUsedAt: string | null;
}

/** The owner of a presented key (same SHA-256 hashing as Settings → Developers), or null. */
export async function findApiKey(secret: string): Promise<KeyOwner | null> {
  const { data, error } = await db().from("api_keys").select("id,user_id,name,last_used_at").eq("key_hash", sha256(secret)).maybeSingle();
  if (error) fail("check API key", error);
  if (!data) return null;
  const r = data as { id: string; user_id: string; name: string; last_used_at: string | null };
  return { keyId: r.id, userId: r.user_id, name: r.name, lastUsedAt: r.last_used_at ? iso(r.last_used_at) : null };
}

export async function touchApiKey(keyId: string): Promise<void> {
  await db().from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
}

/** One hit in the current window; returns the count including this hit. */
export async function rateHit(bucket: string, windowStart: Date): Promise<number> {
  const { data, error } = await db().rpc("api_rate_hit", { p_bucket: bucket, p_window: windowStart.toISOString() });
  if (error) fail("count request", error);
  return Number(data ?? 0);
}

/* ------------------------------------------------------------------ idempotency */

export interface IdemRow {
  fingerprint: string;
  status: number | null;
  response: unknown;
  createdAt: string;
}

/** Claims a key. Returns null when this request owns it now, or the existing row. */
export async function claimIdempotency(userId: string, key: string, fingerprint: string): Promise<IdemRow | null> {
  const { error } = await db().from("api_idempotency").insert({ user_id: userId, key, fingerprint });
  if (!error) return null;
  if (error.code !== "23505") fail("claim idempotency key", error);
  const { data, error: readError } = await db().from("api_idempotency").select("fingerprint,status,response,created_at").eq("user_id", userId).eq("key", key).maybeSingle();
  if (readError) fail("read idempotency key", readError);
  if (!data) return claimIdempotency(userId, key, fingerprint);
  const r = data as { fingerprint: string; status: number | null; response: unknown; created_at: string };
  return { fingerprint: r.fingerprint, status: r.status, response: r.response, createdAt: iso(r.created_at) };
}

export async function saveIdempotency(userId: string, key: string, status: number, response: unknown): Promise<void> {
  await db().from("api_idempotency").update({ status, response }).eq("user_id", userId).eq("key", key);
}

export async function releaseIdempotency(userId: string, key: string): Promise<void> {
  await db().from("api_idempotency").delete().eq("user_id", userId).eq("key", key);
}

/** Housekeeping: idempotency keys live 24 hours, rate windows one hour. */
export async function pruneApiTables(): Promise<void> {
  const now = Date.now();
  await Promise.all([
    db().from("api_idempotency").delete().lt("created_at", new Date(now - 24 * 3600_000).toISOString()),
    db().from("api_rate_limits").delete().lt("window_start", new Date(now - 3600_000).toISOString()),
  ]);
}

/* ------------------------------------------------------------------ API tasks */

export type StructuredState = "none" | "pending" | "requested" | "done" | "failed";

export interface ApiTask {
  taskId: string;
  userId: string;
  apiKeyId: string | null;
  outputSchema: Record<string, unknown> | null;
  structuredState: StructuredState;
  structuredRequestSeq: number | null;
  structuredOutput: unknown;
  structuredError: string | null;
}

interface ApiTaskRow {
  task_id: string;
  user_id: string;
  api_key_id: string | null;
  output_schema: Record<string, unknown> | null;
  structured_state: StructuredState;
  structured_request_seq: number | null;
  structured_output: unknown;
  structured_error: string | null;
}
const API_TASK_COLS = "task_id,user_id,api_key_id,output_schema,structured_state,structured_request_seq,structured_output,structured_error";
const toApiTask = (r: ApiTaskRow): ApiTask => ({
  taskId: r.task_id,
  userId: r.user_id,
  apiKeyId: r.api_key_id,
  outputSchema: r.output_schema,
  structuredState: r.structured_state,
  structuredRequestSeq: r.structured_request_seq === null ? null : Number(r.structured_request_seq),
  structuredOutput: r.structured_output,
  structuredError: r.structured_error,
});

export async function insertApiTask(t: { taskId: string; userId: string; apiKeyId: string; outputSchema: Record<string, unknown> | null }): Promise<void> {
  const { error } = await db()
    .from("api_tasks")
    .insert({ task_id: t.taskId, user_id: t.userId, api_key_id: t.apiKeyId, output_schema: t.outputSchema, structured_state: t.outputSchema ? "pending" : "none" });
  if (error) fail("record API task", error);
}

export async function getApiTask(userId: string, taskId: string): Promise<ApiTask | null> {
  const { data, error } = await db().from("api_tasks").select(API_TASK_COLS).eq("user_id", userId).eq("task_id", taskId).maybeSingle();
  if (error) fail("read API task", error);
  return data ? toApiTask(data as ApiTaskRow) : null;
}

export async function apiTasksFor(userId: string, taskIds: string[]): Promise<Map<string, ApiTask>> {
  if (!taskIds.length) return new Map();
  const { data, error } = await db().from("api_tasks").select(API_TASK_COLS).eq("user_id", userId).in("task_id", taskIds);
  if (error) fail("read API tasks", error);
  return new Map((data as ApiTaskRow[]).map((r) => [r.task_id, toApiTask(r)]));
}

/** Tasks whose structured output is still owed. */
export async function openStructuredTasks(limit = 50): Promise<ApiTask[]> {
  const { data, error } = await db().from("api_tasks").select(API_TASK_COLS).in("structured_state", ["pending", "requested"]).order("created_at").limit(limit);
  if (error) fail("list open API tasks", error);
  return (data as ApiTaskRow[]).map(toApiTask);
}

/** Compare-and-set on the structured state, so two passes never both act. */
export async function moveStructured(taskId: string, from: StructuredState, patch: { state: StructuredState; requestSeq?: number; output?: unknown; error?: string | null }): Promise<boolean> {
  const row: Record<string, unknown> = { structured_state: patch.state, updated_at: new Date().toISOString() };
  if (patch.requestSeq !== undefined) row.structured_request_seq = patch.requestSeq;
  if (patch.output !== undefined) row.structured_output = patch.output;
  if (patch.error !== undefined) row.structured_error = patch.error;
  const { data, error } = await db().from("api_tasks").update(row).eq("task_id", taskId).eq("structured_state", from).select("task_id");
  if (error) fail("update API task", error);
  return (data ?? []).length > 0;
}

export async function deleteApiTask(userId: string, taskId: string): Promise<void> {
  await db().from("api_tasks").delete().eq("user_id", userId).eq("task_id", taskId);
}

/* ------------------------------------------------------------------ webhooks */

export interface Endpoint {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
interface EndpointRow {
  id: string;
  url: string;
  events: string[] | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  secret_enc?: string;
}
const ENDPOINT_COLS = "id,url,events,enabled,created_at,updated_at";
const toEndpoint = (r: EndpointRow): Endpoint => ({ id: r.id, url: r.url, events: r.events ?? [], enabled: r.enabled, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

export async function listEndpoints(userId: string): Promise<Endpoint[]> {
  const { data, error } = await db().from("webhooks").select(ENDPOINT_COLS).eq("user_id", userId).order("created_at", { ascending: false });
  if (error) fail("list webhooks", error);
  return (data as EndpointRow[]).map(toEndpoint);
}

export async function getEndpoint(userId: string, id: string): Promise<Endpoint | null> {
  const { data, error } = await db().from("webhooks").select(ENDPOINT_COLS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("read webhook", error);
  return data ? toEndpoint(data as EndpointRow) : null;
}

export async function countEndpoints(userId: string): Promise<number> {
  const { count, error } = await db().from("webhooks").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) fail("count webhooks", error);
  return count ?? 0;
}

/** Same row shape and sealing as Settings → Developers, so endpoints made here show up there and vice versa. */
export async function insertEndpoint(userId: string, url: string, events: string[]): Promise<{ endpoint: Endpoint; secret: string }> {
  const secret = newSecret();
  const { data, error } = await db().from("webhooks").insert({ user_id: userId, url, events, secret_enc: seal(secret) }).select(ENDPOINT_COLS).single();
  if (error) fail("create webhook", error);
  return { endpoint: toEndpoint(data as EndpointRow), secret };
}

export async function patchEndpoint(userId: string, id: string, patch: { url?: string; events?: string[]; enabled?: boolean; rollSecret?: boolean }): Promise<{ endpoint: Endpoint; secret?: string } | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.url !== undefined) row.url = patch.url;
  if (patch.events !== undefined) row.events = patch.events;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  const secret = patch.rollSecret ? newSecret() : undefined;
  if (secret) row.secret_enc = seal(secret);
  const { data, error } = await db().from("webhooks").update(row).eq("user_id", userId).eq("id", id).select(ENDPOINT_COLS).maybeSingle();
  if (error) fail("update webhook", error);
  return data ? { endpoint: toEndpoint(data as EndpointRow), ...(secret ? { secret } : {}) } : null;
}

export async function removeEndpoint(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("webhooks").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete webhook", error);
  return (data ?? []).length > 0;
}

/** Enabled endpoints of a user, with their opened secrets (unreadable secrets are skipped). */
export async function enabledEndpoints(userId: string): Promise<(Endpoint & { secret: string })[]> {
  const { data, error } = await db().from("webhooks").select(`${ENDPOINT_COLS},secret_enc`).eq("user_id", userId).eq("enabled", true);
  if (error) fail("list webhooks", error);
  const out: (Endpoint & { secret: string })[] = [];
  for (const r of data as EndpointRow[]) {
    try {
      out.push({ ...toEndpoint(r), secret: open(r.secret_enc ?? "") });
    } catch {
      // Sealed with another key: cannot sign, so it cannot receive.
    }
  }
  return out;
}

export async function endpointSecret(id: string): Promise<{ url: string; secret: string; enabled: boolean } | null> {
  const { data, error } = await db().from("webhooks").select("url,enabled,secret_enc").eq("id", id).maybeSingle();
  if (error) fail("read webhook", error);
  if (!data) return null;
  const r = data as { url: string; enabled: boolean; secret_enc: string };
  try {
    return { url: r.url, enabled: r.enabled, secret: open(r.secret_enc) };
  } catch {
    return null;
  }
}

/** Users with at least one enabled endpoint. */
export async function usersWithEndpoints(): Promise<string[]> {
  const { data, error } = await db().from("webhooks").select("user_id").eq("enabled", true).limit(5000);
  if (error) fail("list webhook owners", error);
  return [...new Set((data as { user_id: string }[]).map((r) => r.user_id))];
}

/* ------------------------------------------------------------------ deliveries */

export type DeliveryStatus = "pending" | "delivered" | "failed";

export interface Delivery {
  id: string;
  webhookId: string;
  userId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: string;
  lastStatus: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}
interface DeliveryRow {
  id: string;
  webhook_id: string;
  user_id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attempts: number;
  next_attempt_at: string;
  last_status: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}
const DELIVERY_COLS = "id,webhook_id,user_id,event_id,event_type,payload,status,attempts,next_attempt_at,last_status,last_error,delivered_at,created_at";
const toDelivery = (r: DeliveryRow): Delivery => ({
  id: r.id,
  webhookId: r.webhook_id,
  userId: r.user_id,
  eventId: r.event_id,
  eventType: r.event_type,
  payload: r.payload,
  status: r.status,
  attempts: r.attempts,
  nextAttemptAt: iso(r.next_attempt_at),
  lastStatus: r.last_status,
  lastError: r.last_error,
  deliveredAt: r.delivered_at ? iso(r.delivered_at) : null,
  createdAt: iso(r.created_at),
});

/** Queues one delivery per endpoint; an event already queued for an endpoint is left alone. */
export async function queueDeliveries(rows: { webhookId: string; userId: string; eventId: string; eventType: string; payload: Record<string, unknown> }[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await db()
    .from("webhook_deliveries")
    .upsert(
      rows.map((r) => ({ webhook_id: r.webhookId, user_id: r.userId, event_id: r.eventId, event_type: r.eventType, payload: r.payload })),
      { onConflict: "webhook_id,event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) fail("queue deliveries", error);
  return (data ?? []).length;
}

/** Which of these event ids already have at least one delivery for this user. */
export async function knownEventIds(userId: string, eventIds: string[]): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  const { data, error } = await db().from("webhook_deliveries").select("event_id").eq("user_id", userId).in("event_id", eventIds);
  if (error) fail("check deliveries", error);
  return new Set((data as { event_id: string }[]).map((r) => r.event_id));
}

export async function dueDeliveries(limit = 50): Promise<Delivery[]> {
  const { data, error } = await db().from("webhook_deliveries").select(DELIVERY_COLS).eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (error) fail("list due deliveries", error);
  return (data as DeliveryRow[]).map(toDelivery);
}

/** Leases a due delivery for `leaseMs` by moving its next attempt; false when another worker got it first. */
export async function leaseDelivery(d: Delivery, leaseMs: number): Promise<boolean> {
  const { data, error } = await db()
    .from("webhook_deliveries")
    .update({ next_attempt_at: new Date(Date.now() + leaseMs).toISOString() })
    .eq("id", d.id)
    .eq("status", "pending")
    // Still due: the first worker moves it into the future, so a second one matches nothing.
    .lte("next_attempt_at", new Date().toISOString())
    .select("id");
  if (error) fail("lease delivery", error);
  return (data ?? []).length > 0;
}

export async function recordAttempt(id: string, patch: { status: DeliveryStatus; attempts: number; nextAttemptAt?: string; lastStatus: number | null; lastError: string | null }): Promise<void> {
  const row: Record<string, unknown> = { status: patch.status, attempts: patch.attempts, last_status: patch.lastStatus, last_error: patch.lastError };
  if (patch.nextAttemptAt) row.next_attempt_at = patch.nextAttemptAt;
  if (patch.status === "delivered") row.delivered_at = new Date().toISOString();
  const { error } = await db().from("webhook_deliveries").update(row).eq("id", id);
  if (error) fail("record delivery", error);
}

export async function listDeliveries(userId: string, webhookId: string, opts: { before?: string; limit: number }): Promise<Delivery[]> {
  let q = db().from("webhook_deliveries").select(DELIVERY_COLS).eq("user_id", userId).eq("webhook_id", webhookId).order("created_at", { ascending: false }).limit(opts.limit);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) fail("list deliveries", error);
  return (data as DeliveryRow[]).map(toDelivery);
}

export async function getDelivery(userId: string, id: string): Promise<Delivery | null> {
  const { data, error } = await db().from("webhook_deliveries").select(DELIVERY_COLS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("read delivery", error);
  return data ? toDelivery(data as DeliveryRow) : null;
}

/** Puts a delivery back in the queue for an immediate attempt. */
export async function requeueDelivery(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("webhook_deliveries").update({ status: "pending", next_attempt_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("requeue delivery", error);
  return (data ?? []).length > 0;
}

/* ------------------------------------------------------------------ event scanner */

export async function scannedTo(): Promise<string | null> {
  const { data, error } = await db().from("api_outbox_state").select("scanned_to").eq("id", "events").maybeSingle();
  if (error) fail("read outbox cursor", error);
  return data ? iso((data as { scanned_to: string }).scanned_to) : null;
}

export async function setScannedTo(at: string): Promise<void> {
  const { error } = await db().from("api_outbox_state").upsert({ id: "events", scanned_to: at });
  if (error) fail("save outbox cursor", error);
}

export interface StatusEventRow {
  taskId: string;
  userId: string;
  seq: number;
  at: string;
  status: string;
  brief: string | null;
}

/** `status` events of these users at or after `since`, oldest first. */
export async function statusEventsSince(userIds: string[], since: string, limit = 1000): Promise<StatusEventRow[]> {
  if (!userIds.length) return [];
  const { data, error } = await db().from("task_events").select("task_id,user_id,seq,at,payload").eq("type", "status").in("user_id", userIds).gte("at", since).order("at").limit(limit);
  if (error) fail("scan task events", error);
  return (data as { task_id: string; user_id: string; seq: number; at: string; payload: { status?: string; brief?: string } | null }[]).map((r) => ({
    taskId: r.task_id,
    userId: r.user_id,
    seq: Number(r.seq),
    at: iso(r.at),
    status: r.payload?.status ?? "",
    brief: r.payload?.brief ?? null,
  }));
}

/** Tasks of these users created at or after `since`. */
export async function tasksCreatedSince(userIds: string[], since: string, limit = 500): Promise<{ taskId: string; userId: string }[]> {
  if (!userIds.length) return [];
  const { data, error } = await db().from("tasks").select("id,user_id").in("user_id", userIds).gte("created_at", since).order("created_at").limit(limit);
  if (error) fail("scan tasks", error);
  return (data as { id: string; user_id: string }[]).map((r) => ({ taskId: r.id, userId: r.user_id }));
}
