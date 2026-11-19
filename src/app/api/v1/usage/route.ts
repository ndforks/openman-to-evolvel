// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { ApiError, ok, v1 } from "@/lib/public-api/http";
import { OrgoError, planLabel } from "@/lib/orgo/user-client";
import { orgoFor } from "@/lib/session";

const ALLOWED = [7, 30, 90, 365] as const;

/**
 * GET /api/v1/usage?days=30: the credit balance and spend (a credit is one US dollar; amounts in cents) from the
 * account's Orgo billing. `days` is rounded up to 7, 30, 90 or 365.
 */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const raw = req.nextUrl.searchParams.get("days");
    const asked = raw === null ? 30 : Number(raw);
    if (!Number.isFinite(asked) || asked < 1) throw new ApiError("invalid_request", "invalid_parameter", "days must be a positive number.", "days");
    const days = ALLOWED.find((d) => d >= asked) ?? 365;
    const orgo = await orgoFor(ctx.session);
    const refused = (err: unknown) => {
      if (err instanceof OrgoError && (err.status === 403 || err.status === 401)) return null;
      throw err;
    };
    const [credits, usage] = await Promise.all([orgo.credits().catch(refused), orgo.usage(days).catch(refused)]);
    return ok(ctx, {
      object: "usage",
      plan: credits?.tier ? planLabel(credits.tier) : ctx.session.plan || null,
      balance_cents: typeof credits?.balanceCents === "number" ? credits.balanceCents : null,
      period_days: days,
      available: usage !== null,
      used_cents: usage?.used_cents ?? null,
      daily: usage?.days ?? [],
      models: usage?.models ?? [],
    });
  });
}
