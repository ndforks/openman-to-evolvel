// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { appOrigin, json, withUser } from "@/lib/orgo/http";

/** POST /api/billing/portal -> `{ url }`: the Stripe billing portal for the user's Orgo account. */
export function POST(req: NextRequest) {
  return withUser(req, async ({ orgo }) => {
    const { url } = await orgo.billingPortal(`${appOrigin(req)}/app?settings=billing`);
    return json({ url });
  });
}
