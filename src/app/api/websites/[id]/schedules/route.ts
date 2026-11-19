// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { listSchedules, runScheduleNow, saveSchedules } from "@/lib/websites/stack";

/** GET: the site's jobs and their latest runs. */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json(await listSchedules(session, row), { headers: noStore }));
}

const job = z.object({
  id: z.string().max(40).optional(),
  name: z.string().max(80),
  cron: z.string().max(100),
  command: z.string().max(2000),
  enabled: z.boolean().default(true),
});

/** PUT { schedules }: replace the list (mirrored to the computer). */
export function PUT(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, z.object({ schedules: z.array(job).max(20) }));
    if ("error" in body) return body.error;
    return NextResponse.json({ schedules: await saveSchedules(session, row, body.data.schedules) });
  });
}

/** POST { run: id }: run one job now (inside the published site). */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, z.object({ run: z.string().max(40) }));
    if ("error" in body) return body.error;
    await runScheduleNow(session, row, body.data.run);
    return NextResponse.json({ ok: true });
  });
}
