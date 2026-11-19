// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { baseOf, route } from "@/lib/automations/http";
import { setEnabled, toView } from "@/lib/automations/service";

/** POST /api/automations/[id]/resume */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const { id } = await params;
    const a = await setEnabled(session, id, true);
    return NextResponse.json({ automation: toView(a, baseOf(req)) });
  });
}
