// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { generatorRoute, noStore } from "@/lib/generators/http";
import { availability } from "@/lib/generators/server";
import type { AvailabilityResponse } from "@/lib/generators/types";

/**
 * GET /api/generators: which generators this user can use today, each with `needs` (what would enable it)
 * when it cannot. Checked on the user's computer and cached for a few minutes; `?refresh=1` checks again.
 */
export function GET(req: NextRequest) {
  return generatorRoute(req, async (store) => {
    const refresh = req.nextUrl.searchParams.get("refresh") === "1";
    const body: AvailabilityResponse = { generators: await availability(store, refresh), checkedAt: new Date().toISOString() };
    return NextResponse.json(body, { headers: noStore });
  });
}
