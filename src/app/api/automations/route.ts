// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { readBody } from "@/lib/agent/server/http";
import { baseOf, route } from "@/lib/automations/http";
import { createAutomation, listViews, meta, toView } from "@/lib/automations/service";
import { automationInputSchema } from "@/lib/automations/types";


/** GET /api/automations: the caller's automations (newest first) with their last run, plus plan limits. */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const [automations, m] = await Promise.all([listViews(session, baseOf(req)), meta(session)]);
    return NextResponse.json({ automations, meta: m }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** POST /api/automations: create one (schedule, triggered or advanced). */
export function POST(req: NextRequest) {
  return route(req, async (session) => {
    const body = await readBody(req, automationInputSchema);
    if ("error" in body) return body.error;
    const a = await createAutomation(session, body.data);
    return NextResponse.json({ automation: toView(a, baseOf(req)) }, { status: 201 });
  });
}
