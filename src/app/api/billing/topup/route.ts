// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { BadRequest, appOrigin, json, readJson, withUser } from "@/lib/orgo/http";

/**
 * POST /api/billing/topup `{ amountCents }` -> `{ url }`: Orgo's Stripe Checkout for credits (a credit is a dollar).
 * Whole dollars from $5 to $10,000. Stripe returns to the app's billing settings (`?credit=added` on success).
 */
export function POST(req: NextRequest) {
  return withUser(req, async ({ orgo }) => {
    const body = (await readJson(req)) as { amountCents?: unknown };
    const amount = Number(body?.amountCents);
    if (!Number.isInteger(amount) || amount % 100 !== 0 || amount < 500 || amount > 1_000_000) throw new BadRequest("Pick a whole-dollar amount from $5 to $10,000.");
    const { url } = await orgo.topupCheckout(amount, `${appOrigin(req)}/app?settings=billing`);
    return json({ url });
  });
}
