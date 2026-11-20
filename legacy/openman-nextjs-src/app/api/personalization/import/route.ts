// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { KNOWLEDGE_MAX, listKnowledge } from "@/lib/db/knowledge";
import { proposeFromImport, SuggestError } from "@/lib/personalization/suggest";

const schema = z.object({ text: z.string().trim().min(20, "Paste the transfer document first.").max(60_000) });

/**
 * POST /api/personalization/import `{ text }`: turns a transfer document from another assistant into
 * proposed profile fields and knowledge entries (one model call through the user's agent). Nothing is
 * saved; the client saves what the user accepts.
 */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const existing = await listKnowledge(session.userId);
    const room = Math.max(0, KNOWLEDGE_MAX - existing.length);
    try {
      const result = await proposeFromImport(session, body.data.text, existing.map((k) => k.name), Math.min(10, room));
      return NextResponse.json({ ...result, room });
    } catch (err) {
      if (err instanceof SuggestError) return jsonError(err.message, err.status);
      throw err;
    }
  });
}
