// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { ok, rateLimitPerMinute, v1 } from "@/lib/public-api/http";
import { OrgoError } from "@/lib/orgo/user-client";
import { orgoFor } from "@/lib/session";

/** GET /api/v1/me: who the key acts as, the key itself, and the rate limit. */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    let orgoConnected = true;
    let balance: number | null = null;
    try {
      const credits = await (await orgoFor(ctx.session)).credits();
      balance = typeof credits.balanceCents === "number" ? credits.balanceCents : null;
    } catch (err) {
      if (err instanceof Response) orgoConnected = false;
      else if (!(err instanceof OrgoError)) throw err;
    }
    return ok(ctx, {
      id: ctx.session.userId,
      object: "user",
      name: ctx.session.name || null,
      email: ctx.session.email || null,
      orgo_connected: orgoConnected,
      credits_balance_cents: balance,
      api_key: { id: ctx.keyId },
      rate_limit: { requests_per_minute: rateLimitPerMinute() },
    });
  });
}
