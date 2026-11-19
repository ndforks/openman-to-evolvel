// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Who is asking, and an Orgo client acting as them. Server only.
 *
 * - Signed in with Orgo: the session cookie (see `cookie.ts`) names the user; their Orgo key is read
 *   from `accounts.orgoKeyEnc` and opened only when `orgoFor` is called.
 * - Development bypass (`OPENMAN_DEV_BYPASS=1`, `next dev` only, see `bypass.ts`) and no cookie: a dev session
 *   (`userId: "dev"`) whose Orgo client uses `ORGO_API_KEY` and `ORGO_WORKSPACE_ID` from the env. A real cookie still
 *   wins, so sign-in can be tried locally. With the bypass off the dev identity is unreachable: a dev cookie is refused,
 *   no request falls back to it, and `orgoFor` refuses a dev session (background work included).
 * - Local sign-in (`OPENMAN_LOCAL_SIGNIN=1`) is not a bypass: it makes a real session from this machine's key, through
 *   the same path as a pasted key (`sign-in.ts`).
 */
import { cookies, headers } from "next/headers";
import { open } from "@/lib/crypto";
import { getAccount } from "@/lib/db/accounts";
import { OrgoClient, OrgoError, planLabel, type Method } from "@/lib/orgo/user-client";
import { isAuthDisabled } from "@/lib/supabase/config";
import { sessionsRevokedAt } from "@/lib/personalization/sessions";
import { inviteGateOn, isAdmitted } from "./invites";
import { SESSION_COOKIE, decodeSessionCookie } from "./cookie";

export type { OrgoClient };

export interface Session {
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  plan: string;
  workspaceId: string | null;
  dev?: boolean;
  /** "workspace" when the stored Orgo key is limited to one workspace (no credits, billing or workspace switching). */
  keyScope?: "account" | "workspace";
  /** How this browser signed in: Orgo's approval page, a pasted API key, or this machine's key (local sign-in). */
  via?: "device" | "api_key" | "local";
}

export const DEV_USER_ID = "dev";

/**
 * Whether the env-backed dev identity may be used at all: only with `OPENMAN_DEV_BYPASS=1` on `next dev`, never in
 * production (`isAuthDisabled` is false there, and such a server refuses to start). Background work for
 * `user_id = 'dev'` rows checks this too.
 */
export function devUserEnabled(): boolean {
  return isAuthDisabled;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

/**
 * With the gate off, the dev identity is handed only to requests addressed to and coming from this machine.
 * Next fills `X-Forwarded-For` with the socket address when the client sent none, so a browser elsewhere on the
 * network (or a DNS-rebinding page, whose Host is not loopback) does not get the owner's session. This is a
 * backstop, not a boundary: run the dev server with `-H 127.0.0.1` (see docs/security-model.md).
 */
async function devRequestAllowed(): Promise<boolean> {
  if (!devUserEnabled()) return false;
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return true; // outside a request (scripts, background work on this machine)
  }
  const host = (h.get("host") ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  const fwd = (h.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim().replace(/^\[|\]$/g, "")).filter(Boolean);
  return LOOPBACK.has(host) && fwd.every((a) => LOOPBACK.has(a));
}

/* ---------------------------------------------------------------- dev user */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function devWorkspaceId(): string | null {
  const id = process.env.ORGO_WORKSPACE_ID?.trim();
  return id && UUID.test(id) ? id : null;
}

/**
 * The env key is scoped to one workspace, so Orgo refuses the profile and credits for it. The dev user's
 * name, email and plan come from that workspace's owner fields instead, cached for five minutes.
 */
let devCache: { at: number; session: Session } | null = null;
let devLoading: Promise<Session> | null = null;

function devDefaults(): Session {
  return { userId: DEV_USER_ID, email: "dev@localhost", name: "Developer", avatarUrl: null, plan: "Free", workspaceId: devWorkspaceId(), dev: true };
}

async function devSession(): Promise<Session> {
  if (devCache && Date.now() - devCache.at < 5 * 60_000) return devCache.session;
  devLoading ??= (async () => {
    const base = devDefaults();
    try {
      const client = devClient();
      if (!client || !base.workspaceId) return base;
      const ws = await client.request<{ owner_email?: string | null; owner_name?: string | null; owner_tier?: string | null }>("GET", `/workspaces/${base.workspaceId}`, undefined, { timeoutMs: 5_000 });
      const session: Session = { ...base, email: ws.owner_email || base.email, name: ws.owner_name || ws.owner_email?.split("@")[0] || base.name, plan: planLabel(ws.owner_tier) };
      devCache = { at: Date.now(), session };
      return session;
    } catch {
      devCache = { at: Date.now() - 4 * 60_000, session: base }; // retry in a minute
      return base;
    } finally {
      devLoading = null;
    }
  })();
  return devLoading;
}

/** Destructive lifecycle calls on the shared agent computer (`ORGO_COMPUTER_ID`) are refused for the dev user. */
function devGuard(method: Method, path: string): void {
  const agentId = process.env.ORGO_COMPUTER_ID?.trim().toLowerCase();
  if (!agentId) return;
  const p = path.toLowerCase();
  if (!p.includes(agentId)) return;
  const destructive = (method === "DELETE" && /^\/computers\/[^/]+$/.test(p)) || (method === "POST" && /\/(stop|freeze|suspend|restart|clone|fork)$/.test(p)) || (method === "PATCH" && /\/resize$/.test(p));
  if (destructive) throw new OrgoError("This computer runs the agent and can't be changed from here.", 403, "PROTECTED_COMPUTER");
}

function devClient(): OrgoClient | null {
  const apiKey = process.env.ORGO_API_KEY?.trim();
  if (!apiKey) return null;
  return new OrgoClient({ apiKey, workspaceId: devWorkspaceId(), guard: devGuard });
}

/* ---------------------------------------------------------------- contract */

/** The signed-in user, the dev user when the gate is off, or null. */
export async function getSession(): Promise<Session | null> {
  let cookie: string | undefined;
  try {
    cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    cookie = undefined; // outside a request (scripts): no cookie
  }
  const decoded = decodeSessionCookie(cookie);
  if (decoded) {
    // A dev cookie is never accepted once the gate is on (production, staging).
    if (decoded.session.dev || decoded.session.userId === DEV_USER_ID) return devUserEnabled() && (await devRequestAllowed()) ? devSession() : null;
    // "Sign out everywhere" refuses every cookie issued before it; a refused cookie is signed out (never the dev user).
    if (await revokedBefore(decoded.session.userId, decoded.issuedAt)) return null;
    // Invite gate (staging): someone removed from the list loses access on their next request (cached briefly).
    if (inviteGateOn() && !(await isAdmitted(decoded.session.userId, decoded.session.email))) return null;
    return decoded.session;
  }
  if (devUserEnabled() && (await devRequestAllowed())) return devSession();
  return null;
}

/** `sessionsRevokedAt` per user, cached briefly so every request does not read the settings row. */
// On globalThis: each route is its own bundle with its own copy of this module, and "sign out everywhere" must
// clear the one every route reads, not only its own.
const revokedGlobal = globalThis as typeof globalThis & { __omRevoked?: Map<string, { at: number; value: number | null }> };
const revokedCache = (revokedGlobal.__omRevoked ??= new Map());
const REVOKED_TTL_MS = 15_000;

async function revokedBefore(userId: string, issuedAt: number): Promise<boolean> {
  if (userId === DEV_USER_ID) return false;
  let hit = revokedCache.get(userId);
  if (!hit || Date.now() - hit.at > REVOKED_TTL_MS) {
    let value: number | null = null;
    try {
      const iso = await sessionsRevokedAt(userId);
      value = iso ? Date.parse(iso) || null : null;
    } catch {
      value = hit?.value ?? null; // database hiccup: keep the last known answer rather than signing everyone out
    }
    hit = { at: Date.now(), value };
    revokedCache.set(userId, hit);
  }
  return hit.value !== null && issuedAt < hit.value;
}

/** Forget the cached revocation time (call after "sign out everywhere" so it applies at once on this server). */
export function forgetRevocation(userId: string): void {
  revokedCache.delete(userId);
}

/** The session, or throws a 401 JSON `Response` for the route to return as is. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (session) return session;
  throw Response.json({ error: "Sign in to continue.", code: "signed_out" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

/**
 * An Orgo client acting as this user. Throws a 401 `Response` when the account has no usable key
 * (deleted, or sealed with another key): the person signs in again.
 */
export async function orgoFor(session: Session): Promise<OrgoClient> {
  if (session.dev || session.userId === DEV_USER_ID) {
    if (!devUserEnabled()) throw Response.json({ error: "Sign in to continue.", code: "signed_out" }, { status: 401 });
    const client = devClient();
    if (!client) throw Response.json({ error: "The server has no ORGO_API_KEY for the dev user.", code: "not_configured" }, { status: 503 });
    return client;
  }
  const account = await getAccount(session.userId);
  if (!account?.orgoKeyEnc) throw Response.json({ error: "Your Orgo sign-in has ended. Sign in again.", code: "orgo_key_missing" }, { status: 401 });
  let apiKey: string;
  try {
    apiKey = open(account.orgoKeyEnc);
  } catch {
    throw Response.json({ error: "Your Orgo sign-in can't be read. Sign in again.", code: "orgo_key_unreadable" }, { status: 401 });
  }
  return new OrgoClient({ apiKey, workspaceId: account.workspaceId ?? session.workspaceId });
}

/** Wraps a route body: returns a thrown `Response` (401 from `requireSession`) as is. */
export async function handleSessionErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
