// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Developer credentials for this app: API keys (only a SHA-256 hash is stored; the key is shown once)
 * and webhook endpoints (the signing secret is sealed with `APP_ENCRYPTION_KEY`). Tables `api_keys` and
 * `webhooks`, scoped by `user_id`. `/api/v1` accepts the keys; `src/lib/public-api/webhooks.ts` delivers the events. Server only.
 */
import { createHash, randomBytes } from "node:crypto";
import { open, seal } from "@/lib/crypto";
import { db, DbError, fail, iso } from "@/lib/db/client";

export const API_KEYS_MAX = 50;
export const WEBHOOKS_MAX = 20;
export const WEBHOOK_EVENTS = ["task.created", "task.completed", "task.failed", "task.stopped", "task.needs_input", "task.deleted"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface ApiKey {
  id: string;
  name: string;
  /** The first characters of the key, enough to recognise it. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}
const toKey = (r: KeyRow): ApiKey => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: iso(r.created_at), lastUsedAt: r.last_used_at ? iso(r.last_used_at) : null });

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const { data, error } = await db().from("api_keys").select("id,name,prefix,created_at,last_used_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) fail("list API keys", error);
  return (data as KeyRow[]).map(toKey);
}

/** Creates a key and returns it in full exactly once. */
export async function createApiKey(userId: string, name: string): Promise<{ key: ApiKey; secret: string }> {
  const { count, error: countError } = await db().from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (countError) fail("count API keys", countError);
  if ((count ?? 0) >= API_KEYS_MAX) throw new DbError(`You can keep at most ${API_KEYS_MAX} API keys.`, "limit");
  const secret = `om_${randomBytes(24).toString("base64url")}`;
  const { data, error } = await db()
    .from("api_keys")
    .insert({ user_id: userId, name, prefix: `${secret.slice(0, 9)}…`, key_hash: hashKey(secret) })
    .select("id,name,prefix,created_at,last_used_at")
    .single();
  if (error) fail("create API key", error);
  return { key: toKey(data as KeyRow), secret };
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("api_keys").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("revoke API key", error);
  return (data ?? []).length > 0;
}

/** For the future public API: the owner of a presented key, or null. Records the use. */
export async function userForApiKey(secret: string): Promise<string | null> {
  if (!/^om_[A-Za-z0-9_-]{20,64}$/.test(secret)) return null;
  const { data, error } = await db().from("api_keys").select("id,user_id").eq("key_hash", hashKey(secret)).maybeSingle();
  if (error) fail("check API key", error);
  if (!data) return null;
  const row = data as { id: string; user_id: string };
  await db().from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return row.user_id;
}

interface HookRow {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  created_at: string;
  secret_enc?: string;
}
const toHook = (r: HookRow): Webhook => ({ id: r.id, url: r.url, events: (r.events ?? []).filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e)), enabled: r.enabled, createdAt: iso(r.created_at) });
const HOOK_COLS = "id,url,events,enabled,created_at";
const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

export async function listWebhooks(userId: string): Promise<Webhook[]> {
  const { data, error } = await db().from("webhooks").select(HOOK_COLS).eq("user_id", userId).order("created_at", { ascending: false });
  if (error) fail("list webhooks", error);
  return (data as HookRow[]).map(toHook);
}

/** Creates an endpoint and returns its signing secret once. */
export async function createWebhook(userId: string, url: string, events: WebhookEvent[]): Promise<{ webhook: Webhook; secret: string }> {
  const { count, error: countError } = await db().from("webhooks").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (countError) fail("count webhooks", countError);
  if ((count ?? 0) >= WEBHOOKS_MAX) throw new DbError(`You can add at most ${WEBHOOKS_MAX} webhook endpoints.`, "limit");
  const secret = newSecret();
  const { data, error } = await db().from("webhooks").insert({ user_id: userId, url, events, secret_enc: seal(secret) }).select(HOOK_COLS).single();
  if (error) fail("create webhook", error);
  return { webhook: toHook(data as HookRow), secret };
}

export async function updateWebhook(userId: string, id: string, patch: { enabled?: boolean; events?: WebhookEvent[]; url?: string }): Promise<Webhook | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.events !== undefined) row.events = patch.events;
  if (patch.url !== undefined) row.url = patch.url;
  const { data, error } = await db().from("webhooks").update(row).eq("user_id", userId).eq("id", id).select(HOOK_COLS).maybeSingle();
  if (error) fail("update webhook", error);
  return data ? toHook(data as HookRow) : null;
}

/** Replaces the signing secret; the old one stops working at once. */
export async function rollWebhookSecret(userId: string, id: string): Promise<string | null> {
  const secret = newSecret();
  const { data, error } = await db().from("webhooks").update({ secret_enc: seal(secret), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("roll webhook secret", error);
  return (data ?? []).length ? secret : null;
}

export async function deleteWebhook(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("webhooks").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete webhook", error);
  return (data ?? []).length > 0;
}

/** For the future delivery worker: enabled endpoints subscribed to an event, with their secrets. */
export async function webhooksFor(userId: string, event: WebhookEvent): Promise<(Webhook & { secret: string })[]> {
  const { data, error } = await db().from("webhooks").select(`${HOOK_COLS},secret_enc`).eq("user_id", userId).eq("enabled", true).contains("events", [event]);
  if (error) fail("list webhooks", error);
  return (data as HookRow[]).map((r) => ({ ...toHook(r), secret: open(r.secret_enc ?? "") }));
}
