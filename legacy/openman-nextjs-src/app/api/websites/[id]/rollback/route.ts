// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { siteRoute, type IdParams } from "@/lib/websites/http";
import { rollback } from "@/lib/websites/server";

const schema = z.object({ sha: z.string().regex(/^[0-9a-f]{7,40}$/) });

/** POST `{ sha }`: restore that version's files as a new version (republishes when auto-publish is on). */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ checkpoints: await rollback(session, row, body.data.sha) });
  });
}
