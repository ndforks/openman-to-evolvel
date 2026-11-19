// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { json } from "@/lib/orgo/http";
import { SESSION_COOKIE } from "@/lib/session/cookie";

/**
 * POST /api/auth/signout: ends the session on this browser. The Orgo key stays sealed on the account
 * so the user's automations keep running; they can revoke it in Orgo (Settings, API keys).
 */
export function POST() {
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
