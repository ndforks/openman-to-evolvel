// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { isModeId } from "@/lib/agent/server/tasks";
import { siteStoreRoute, type IdParams } from "@/lib/websites/http";
import { editInNewTask } from "@/lib/websites/server";

const schema = z.object({
  prompt: z.string().trim().min(1).max(200_000),
  mode: z.unknown().transform((v) => (isModeId(v) ? v : "standard")),
});

/** POST `{ prompt, mode? }`: "Edit in new task": a new agent task on the same site folder. */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteStoreRoute(req, ctx, async (session, row, store) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ task: await editInNewTask(store, session, row, body.data) }, { status: 201 });
  });
}
