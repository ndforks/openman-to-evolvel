// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/automations/http";
import { runsWithNames } from "@/lib/automations/views";


/** GET /api/automations/runs?from=&to=&limit=: every run of the caller's automations (the Updates tab). */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const sp = req.nextUrl.searchParams;
    const runs = await runsWithNames(session.userId, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, limit: Number(sp.get("limit") ?? 200) || 200 });
    return NextResponse.json({ runs }, { headers: { "Cache-Control": "no-store" } });
  });
}
