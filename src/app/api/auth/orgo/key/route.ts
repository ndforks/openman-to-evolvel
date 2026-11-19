// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { BadRequest, errorResponse, json, readJson } from "@/lib/orgo/http";
import { logEvent } from "@/lib/observability/log";
import { KeyRejected, WORKSPACE_KEY_LIMITS } from "@/lib/session/identify";
import { signInWithKey } from "@/lib/session/sign-in";
import { SESSION_COOKIE, SIGNIN_COOKIE, sessionCookieOptions } from "@/lib/session/cookie";
import { SignInBusy, takeKeyAttempt } from "@/lib/session/signin-limit";
import { WAITLIST_PATH, safeNextPath } from "@/lib/supabase/config";

/**
 * POST /api/auth/orgo/key `{ apiKey, next? }`: "Use an API key instead". The key is checked with Orgo (its profile,
 * or for a workspace-scoped key its workspace), stored sealed on the account exactly like the approval flow's key,
 * and this browser is signed in. The key is never logged or sent back.
 * - 200 `{ status: "approved", redirect, keyScope, note? }` (`note` explains a workspace key's limits).
 * - 200 `{ status: "waitlist", redirect }`: a real Orgo account, not on this deployment's invite list.
 * - 400/401/403 `{ error, code }`: malformed, refused by Orgo, too narrow, or a shared workspace's key.
 * - 429 `{ error, code: "signin_busy", retryAfter }`: too many attempts from this network.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await readJson(req, 8 * 1024)) as { apiKey?: unknown; next?: unknown };
    if (typeof body?.apiKey !== "string" || !body.apiKey.trim()) throw new BadRequest("Paste your Orgo API key.");
    await takeKeyAttempt(req.headers);
    const result = await signInWithKey(body.apiKey, { via: "api_key" });
    if (result.kind === "waitlist") {
      const res = json({ status: "waitlist", redirect: WAITLIST_PATH });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    void logEvent("info", "signin.api_key", { userId: result.session.userId, data: { scope: result.identity.scope } });
    const res = json({
      status: "approved",
      redirect: safeNextPath(typeof body.next === "string" ? body.next : null),
      keyScope: result.identity.scope,
      ...(result.identity.scope === "workspace" ? { note: WORKSPACE_KEY_LIMITS } : {}),
      user: { name: result.session.name, email: result.session.email },
    });
    res.cookies.set(SESSION_COOKIE, result.cookie, sessionCookieOptions);
    res.cookies.delete(SIGNIN_COOKIE);
    return res;
  } catch (err) {
    if (err instanceof KeyRejected) return json({ error: err.message, code: err.code }, err.status);
    if (err instanceof SignInBusy) {
      const res = json({ error: err.message, code: "signin_busy", retryAfter: err.retryAfter }, 429);
      res.headers.set("Retry-After", String(err.retryAfter));
      return res;
    }
    return errorResponse(err, req);
  }
}
