// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { completeOrgoSignIn } from "@/lib/session/sign-in";
import { BadRequest, errorResponse, json, readJson } from "@/lib/orgo/http";
import { pollDeviceSignIn } from "@/lib/orgo/user-client";
import { SESSION_COOKIE, SIGNIN_COOKIE, openDeviceHandle, openPendingSignIn, sessionCookieOptions } from "@/lib/session/cookie";
import { WAITLIST_PATH, safeNextPath } from "@/lib/supabase/config";

/**
 * POST /api/auth/orgo/poll `{ handle, next? }`: one check of a "Sign in with Orgo" started by `/start`.
 * - `{ status: "pending", interval }`: ask again after `interval` seconds.
 * - `{ status: "denied" | "expired" }`: stop; the person can start again.
 * - `{ status: "approved", redirect }`: the account is saved (Orgo key sealed), the session cookie is set.
 * - `{ status: "waitlist", redirect }`: signed in at Orgo, but not on the invite list.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await readJson(req)) as { handle?: unknown; next?: unknown };
    if (typeof body?.handle !== "string") throw new BadRequest("handle is required.");
    // Only the browser that started this sign-in may finish it: the handle must match its HttpOnly cookie.
    // (A device-code link sent to someone else cannot be polled from the sender's script without that cookie.)
    const pending = openPendingSignIn(req.cookies.get(SIGNIN_COOKIE)?.value);
    if (!pending || pending.handle !== body.handle) return json({ status: "expired" });
    const deviceCode = openDeviceHandle(body.handle);
    if (!deviceCode) return json({ status: "expired" });

    const answer = await pollDeviceSignIn(deviceCode);
    if (answer.status === "pending") return json({ status: "pending", interval: answer.interval });
    if (answer.status !== "approved") {
      const res = json({ status: answer.status });
      res.cookies.delete(SIGNIN_COOKIE);
      return res;
    }

    const result = await completeOrgoSignIn(answer.api_key, answer.key_id, answer.user);
    if (result.kind === "waitlist") {
      const res = json({ status: "waitlist", redirect: WAITLIST_PATH });
      res.cookies.delete(SESSION_COOKIE);
      res.cookies.delete(SIGNIN_COOKIE);
      return res;
    }
    const res = json({ status: "approved", redirect: safeNextPath(typeof body.next === "string" ? body.next : null), user: { name: result.session.name, email: result.session.email }, keyScope: result.identity.scope });
    res.cookies.set(SESSION_COOKIE, result.cookie, sessionCookieOptions);
    res.cookies.delete(SIGNIN_COOKIE);
    return res;
  } catch (err) {
    return errorResponse(err, req);
  }
}
