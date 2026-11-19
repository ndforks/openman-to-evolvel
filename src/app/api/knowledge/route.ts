// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, withSession } from "@/lib/agent/server/http";
import { createKnowledge, KNOWLEDGE_MAX, listKnowledge } from "@/lib/db/knowledge";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name the entry.").max(200),
  whenToUse: z.string().max(2000).optional(),
  content: z.string().max(20_000).optional(),
  enabled: z.boolean().optional(),
});

/** GET /api/knowledge: `{ knowledge, limit }`, oldest first. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ knowledge: await listKnowledge(session.userId), limit: KNOWLEDGE_MAX }));
}

/** POST /api/knowledge: add an entry. 400 once the user has 50. */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, createSchema);
    if ("error" in body) return body.error;
    return NextResponse.json({ entry: await createKnowledge(session.userId, body.data) }, { status: 201 });
  });
}
