// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { testRun, toRunView } from "@/lib/automations/service";
import { ok, v1 } from "@/lib/public-api/http";
import { snake } from "@/lib/public-api/resources";

/** POST /api/v1/automations/{id}/run: run it now (works while paused; not retried, not counted toward auto-pause). */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const run = await testRun(ctx.session, id);
    return ok(ctx, { object: "automation_run", ...(snake(toRunView(run)) as Record<string, unknown>) }, 202);
  });
}
