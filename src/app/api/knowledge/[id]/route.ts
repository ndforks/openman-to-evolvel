// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { deleteKnowledge, getKnowledge, updateKnowledge } from "@/lib/db/knowledge";

type Params = { params: Promise<{ id: string }> };
const notFound = () => jsonError("Knowledge entry not found.", 404);

export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const entry = await getKnowledge(session.userId, id);
    return entry ? NextResponse.json({ entry }) : notFound();
  });
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    whenToUse: z.string().max(2000).optional(),
    content: z.string().max(20_000).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");

/** PATCH /api/knowledge/[id]: edit, or toggle with `{ enabled }`. */
export function PATCH(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, patchSchema);
    if ("error" in body) return body.error;
    const entry = await updateKnowledge(session.userId, id, body.data);
    return entry ? NextResponse.json({ entry }) : notFound();
  });
}

export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    return (await deleteKnowledge(session.userId, id)) ? NextResponse.json({ ok: true }) : notFound();
  });
}
