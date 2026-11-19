// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/automations/http";
import { calendarMonth } from "@/lib/automations/views";


/** GET /api/automations/calendar?month=YYYY-MM&tz=Area/City: runs and upcoming runs per local day. */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const sp = req.nextUrl.searchParams;
    const month = sp.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Use month=YYYY-MM." }, { status: 400 });
    return NextResponse.json(await calendarMonth(session.userId, month, sp.get("tz") ?? "UTC"), { headers: { "Cache-Control": "no-store" } });
  });
}
