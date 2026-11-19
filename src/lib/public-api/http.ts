/**
 * Plumbing for `/api/v1`: the response envelope, typed errors, API-key authentication, the per-key
 * rate limit, idempotency keys, cursor pagination and body parsing. Server only.
 *
 * Envelope: `{ ok: true, request_id, data }` (lists add `has_more` and `next_cursor`), or
 * `{ ok: false, request_id, error: { type, code, message, param? } }`. Every answer carries `X-Request-Id`.
 */
import { randomBytes } from "node:crypto";
import { connection, NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { refreshOwner } from "@/lib/agent/server/relay";
import { primeConnection } from "@/lib/agent/server/connection";
import { ComputerError } from "@/lib/agent/server/computer";
import { AutomationError } from "@/lib/automations/service";
import { DbError } from "@/lib/db/client";
import { claimIdempotency, findApiKey, rateHit, releaseIdempotency, saveIdempotency, sha256, touchApiKey } from "@/lib/db/public-api";
import { OrgoError } from "@/lib/orgo/user-client";
import { BadRequest } from "@/lib/orgo/http";
import type { Session } from "@/lib/session";
import { SkillError } from "@/lib/skills";
import { StorageUnavailableError, storeForSession, type Store } from "@/lib/store";
import { SiteError } from "@/lib/websites/server";
import { ownerSession } from "./owner";
import { kickWorker } from "./webhooks";

export const API_VERSION = "2026-11-19";

/* ------------------------------------------------------------------ errors */

export type ErrorType =
  | "invalid_request"
  | "authentication_error"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "idempotency_error"
  | "rate_limited"
  | "upstream_error"
  | "internal_error";

const STATUS: Record<ErrorType, number> = {
  invalid_request: 400,
  authentication_error: 401,
  permission_denied: 403,
  not_found: 404,
  conflict: 409,
  idempotency_error: 422,
  rate_limited: 429,
  upstream_error: 502,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly type: ErrorType,
    readonly code: string,
    message: string,
    readonly param?: string,
    status?: number,
  ) {
    super(message);
    this.status = status ?? STATUS[type];
  }
}

export const notFound = (what: string) => new ApiError("not_found", "resource_not_found", `${what} not found.`);

/* ------------------------------------------------------------------ envelope */

export interface Ctx {
  requestId: string;
  session: Session;
  keyId: string;
  /** Rate-limit headers for this request. */
  headers: Record<string, string>;
}

const newRequestId = () => `req_${randomBytes(12).toString("base64url")}`;

function baseHeaders(requestId: string, extra: Record<string, string> = {}): Record<string, string> {
  return { "Cache-Control": "no-store", "X-Request-Id": requestId, "X-Api-Version": API_VERSION, ...extra };
}

export function ok(ctx: Pick<Ctx, "requestId" | "headers">, data: unknown, status = 200): NextResponse {
  return NextResponse.json({ ok: true, request_id: ctx.requestId, data }, { status, headers: baseHeaders(ctx.requestId, ctx.headers) });
}

export function list(ctx: Pick<Ctx, "requestId" | "headers">, page: Page<unknown>): NextResponse {
  return NextResponse.json({ ok: true, request_id: ctx.requestId, data: page.data, has_more: page.hasMore, next_cursor: page.nextCursor }, { headers: baseHeaders(ctx.requestId, ctx.headers) });
}

function errorJson(requestId: string, err: ApiError, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(
    { ok: false, request_id: requestId, error: { type: err.type, code: err.code, message: err.message, ...(err.param ? { param: err.param } : {}) } },
    { status: err.status, headers: baseHeaders(requestId, headers) },
  );
}

/** Maps anything a handler throws onto the error format. */
function toApiError(err: unknown, where: string): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof BadRequest) return new ApiError(err.status === 404 ? "not_found" : "invalid_request", "invalid_request", err.message, undefined, err.status);
  if (err instanceof AutomationError) {
    const type: ErrorType = err.status === 404 ? "not_found" : err.status === 403 ? "permission_denied" : err.status >= 500 ? "internal_error" : "invalid_request";
    return new ApiError(type, type === "permission_denied" ? "plan_limit" : type === "not_found" ? "resource_not_found" : "invalid_request", err.message, undefined, err.status);
  }
  if (err instanceof SkillError || err instanceof SiteError || err instanceof ComputerError) {
    const status = (err as { status?: number }).status ?? 500;
    const type: ErrorType = status === 404 ? "not_found" : status === 409 ? "conflict" : status === 403 ? "permission_denied" : status >= 500 ? "upstream_error" : "invalid_request";
    return new ApiError(type, (err as { code?: string }).code || type, err.message, undefined, status >= 500 ? 502 : status);
  }
  if (err instanceof OrgoError) {
    if (err.status === 401) return new ApiError("permission_denied", "orgo_unauthorized", "This account's Orgo sign-in has ended. The owner must sign in to the web app again.");
    if (err.status === 403) return new ApiError("permission_denied", err.code || "orgo_forbidden", err.message);
    if (err.status === 404) return new ApiError("not_found", "resource_not_found", err.message);
    if (err.status === 402) return new ApiError("permission_denied", "insufficient_credits", err.message);
    if (err.status === 429) return new ApiError("rate_limited", "upstream_rate_limited", err.message);
    if (err.status >= 400 && err.status < 500) return new ApiError("invalid_request", err.code || "invalid_request", err.message, undefined, err.status);
    return new ApiError("upstream_error", "orgo_unavailable", "Orgo did not answer. Try again in a moment.");
  }
  if (err instanceof DbError && (err.code === "limit" || err.code === "invalid")) return new ApiError("invalid_request", err.code === "limit" ? "limit_reached" : "invalid_request", err.message);
  if (err instanceof StorageUnavailableError) return new ApiError("upstream_error", "storage_unavailable", err.message, undefined, 503);
  console.error(`[api/v1] ${where} failed:`, err instanceof Error ? err.message : err);
  return new ApiError("internal_error", "internal_error", "Something went wrong on our side. Retry, and contact support with the request id if it persists.");
}

/** A Response thrown by the session layer (`orgoFor`): 401 there means the owner's Orgo link is gone. */
async function fromThrownResponse(res: Response): Promise<ApiError> {
  let message = "This account is not connected to Orgo.";
  let code = "account_not_connected";
  try {
    const body = (await res.clone().json()) as { error?: string; code?: string };
    if (body.error) message = body.error;
    if (body.code) code = body.code;
  } catch {
    // Keep the defaults.
  }
  if (res.status === 401 || res.status === 403) return new ApiError("permission_denied", code, `${message} (The account behind this API key has no usable Orgo connection.)`);
  if (res.status === 404) return new ApiError("not_found", code, message);
  return new ApiError(res.status >= 500 ? "upstream_error" : "invalid_request", code, message, undefined, res.status);
}

/* ------------------------------------------------------------------ auth and rate limit */

const KEY_SHAPE = /^om_[A-Za-z0-9_-]{20,64}$/;

export function rateLimitPerMinute(): number {
  const n = Number(process.env.PUBLIC_API_RATE_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120;
}

async function authenticate(req: NextRequest): Promise<{ keyId: string; session: Session }> {
  const header = req.headers.get("authorization") ?? "";
  if (!header) throw new ApiError("authentication_error", "missing_api_key", "No API key. Send `Authorization: Bearer <key>`.");
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  if (!m) throw new ApiError("authentication_error", "malformed_authorization", "The Authorization header must be `Bearer <key>`.");
  const secret = m[1];
  if (!KEY_SHAPE.test(secret)) throw new ApiError("authentication_error", "invalid_api_key", "This API key is not valid. Keys start with `om_`; create one in Settings → Developers.");
  const owner = await findApiKey(secret);
  if (!owner) throw new ApiError("authentication_error", "invalid_api_key", "This API key is not valid or has been revoked.");
  // Last-used tracking, written at most once a minute per key.
  if (!owner.lastUsedAt || Date.now() - Date.parse(owner.lastUsedAt) > 60_000) void touchApiKey(owner.keyId).catch(() => undefined);
  return { keyId: owner.keyId, session: await ownerSession(owner.userId) };
}

async function rateLimit(keyId: string): Promise<Record<string, string>> {
  const limit = rateLimitPerMinute();
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / 60_000) * 60_000);
  const reset = Math.ceil((windowStart.getTime() + 60_000) / 1000);
  const count = await rateHit(`key:${keyId}`, windowStart);
  const headers = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, limit - count)),
    "X-RateLimit-Reset": String(reset),
  };
  if (count > limit) {
    const retry = Math.max(1, reset - Math.floor(now / 1000));
    throw Object.assign(new ApiError("rate_limited", "rate_limit_exceeded", `Too many requests: this key may make ${limit} requests per minute. Retry after ${retry} s.`), {
      headers: { ...headers, "Retry-After": String(retry) },
    });
  }
  return headers;
}

/**
 * Runs a `/api/v1` handler: authenticates the key, applies the rate limit, and turns anything thrown
 * into the error format. Every route goes through here.
 */
export async function v1(req: NextRequest, handler: (ctx: Ctx) => Promise<Response>): Promise<Response> {
  await connection(); // per request, never prerendered
  const requestId = newRequestId();
  let headers: Record<string, string> = {};
  try {
    const { keyId, session } = await authenticate(req);
    headers = await rateLimit(keyId);
    kickWorker();
    return await handler({ requestId, session, keyId, headers });
  } catch (err) {
    if (err instanceof Response) return errorJson(requestId, await fromThrownResponse(err), headers);
    const apiErr = toApiError(err, `${req.method} ${req.nextUrl.pathname}`);
    const extra = (err as { headers?: Record<string, string> }).headers;
    return errorJson(requestId, apiErr, extra ?? headers);
  }
}

/** The owner's task store with the agent connection primed (what the internal routes' `withStore` does). */
export async function storeFor(session: Session): Promise<Store> {
  const store = await storeForSession(session);
  await primeConnection(session);
  refreshOwner(store);
  return store;
}

/* ------------------------------------------------------------------ bodies and queries */

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  const text = await req.text();
  try {
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("invalid_request", "invalid_json", "The request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const param = issue?.path.length ? issue.path.join(".") : undefined;
    throw new ApiError("invalid_request", "invalid_parameter", `${param ? `${param}: ` : ""}${issue?.message ?? "Invalid request."}`, param);
  }
  return parsed.data;
}

export function limitParam(req: NextRequest, def = 20, max = 100): number {
  const raw = req.nextUrl.searchParams.get("limit");
  if (raw === null) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new ApiError("invalid_request", "invalid_parameter", `limit must be an integer from 1 to ${max}.`, "limit");
  return n;
}

/* ------------------------------------------------------------------ pagination */

export interface Page<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

const encodeCursor = (v: string) => Buffer.from(v, "utf8").toString("base64url");
function decodeCursor(c: string): string {
  try {
    return Buffer.from(c, "base64url").toString("utf8");
  } catch {
    throw new ApiError("invalid_request", "invalid_cursor", "This cursor is not valid.", "cursor");
  }
}

/**
 * Cursor pagination over an array already in its final order. `key` must be unique and stable
 * (e.g. `createdAt|id`); the cursor is the key of the last item returned.
 */
export function paginate<T>(items: T[], req: NextRequest, key: (item: T) => string, def = 20): Page<T> {
  const limit = limitParam(req, def);
  const cursor = req.nextUrl.searchParams.get("cursor");
  let start = 0;
  if (cursor) {
    const k = decodeCursor(cursor);
    const at = items.findIndex((i) => key(i) === k);
    if (at === -1) throw new ApiError("invalid_request", "invalid_cursor", "This cursor is not valid or the item it points at is gone.", "cursor");
    start = at + 1;
  }
  const data = items.slice(start, start + limit);
  const hasMore = start + limit < items.length;
  return { data, hasMore, nextCursor: hasMore && data.length ? encodeCursor(key(data[data.length - 1])) : null };
}

/* ------------------------------------------------------------------ idempotency */

/**
 * Runs a create once per `Idempotency-Key` (24 hours, per account). A retry with the same key and the
 * same body gets the first answer back (with `Idempotent-Replayed: true`); a different body is a 422.
 */
export async function idempotent(req: NextRequest, ctx: Ctx, raw: string, run: () => Promise<{ status: number; data: unknown }>): Promise<Response> {
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key) {
    const r = await run();
    return ok(ctx, r.data, r.status);
  }
  if (key.length > 255) throw new ApiError("invalid_request", "invalid_parameter", "Idempotency-Key must be at most 255 characters.", "Idempotency-Key");
  const fingerprint = sha256(`${req.method} ${req.nextUrl.pathname}\n${raw}`);
  const existing = await claimIdempotency(ctx.session.userId, key, fingerprint);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new ApiError("idempotency_error", "idempotency_key_reused", "This Idempotency-Key was already used with a different request.", "Idempotency-Key");
    if (existing.status === null) throw new ApiError("conflict", "idempotency_in_progress", "A request with this Idempotency-Key is still being processed. Retry shortly.");
    return NextResponse.json({ ok: true, request_id: ctx.requestId, data: existing.response }, { status: existing.status, headers: baseHeaders(ctx.requestId, { ...ctx.headers, "Idempotent-Replayed": "true" }) });
  }
  try {
    const r = await run();
    await saveIdempotency(ctx.session.userId, key, r.status, r.data);
    return ok(ctx, r.data, r.status);
  } catch (err) {
    await releaseIdempotency(ctx.session.userId, key).catch(() => undefined);
    throw err;
  }
}

/** Reads the raw body once, so it can be both fingerprinted and validated. */
export async function rawBody(req: NextRequest): Promise<{ raw: string; json: unknown }> {
  const raw = await req.text();
  if (!raw.trim()) return { raw, json: {} };
  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    throw new ApiError("invalid_request", "invalid_json", "The request body must be valid JSON.");
  }
}

export function validate<T>(json: unknown, schema: ZodType<T>): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const param = issue?.path.length ? issue.path.join(".") : undefined;
    throw new ApiError("invalid_request", "invalid_parameter", `${param ? `${param}: ` : ""}${issue?.message ?? "Invalid request."}`, param);
  }
  return parsed.data;
}

/** Public base URL of this app, for links in responses. */
export function baseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (req.nextUrl.protocol.replace(":", "") || "http");
  if (host) return `${proto}://${host}`;
  return process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "") || req.nextUrl.origin;
}

/** `after` (or `cursor`) as an event seq: everything strictly after it. */
export function afterParam(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get("after") ?? req.nextUrl.searchParams.get("cursor");
  if (raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ApiError("invalid_request", "invalid_parameter", "after must be a non-negative integer (an event seq).", "after");
  return n;
}
