// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/automations/http";
import { refreshRuns } from "@/lib/automations/views";
import { toRunView } from "@/lib/automations/service";
import { getAutomation, listRuns } from "@/lib/db/automations";


/** GET /api/automations/[id]/runs: this automation's runs, newest first. */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const { id } = await params;
    const a = await getAutomation(session.userId, id);
    if (!a) return NextResponse.json({ error: "Automation not found." }, { status: 404 });
    const runs = await refreshRuns(await listRuns(session.userId, { automationId: id, limit: 100 }));
    return NextResponse.json({ runs: runs.map((r) => toRunView(r, a.name)) }, { headers: { "Cache-Control": "no-store" } });
  });
}
