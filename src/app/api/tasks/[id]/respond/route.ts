// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, notFound, readBody, withTask } from "@/lib/agent/server/http";
import { runtimeFor } from "@/lib/agent/server/tasks";

const respondSchema = z
  .object({
    requestId: z.string().min(1).max(300),
    choice: z.string().max(2000).optional(),
    answer: z.string().max(100_000).optional(),
  })
  .refine((v) => v.choice !== undefined || v.answer !== undefined, "Send a choice or an answer.");

/** POST /api/tasks/[id]/respond: answer an approval request (`choice`) or a question (`answer`). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store, role }) => {
    const body = await readBody(req, respondSchema);
    if ("error" in body) return body.error;
    // Changes to the owner's project are the owner's to approve, not a collaborator's.
    if (role === "collaborator" && body.data.requestId.startsWith("ext:project-update")) return jsonError("Only the task's owner can approve project changes.", 403);
    const runtime = await runtimeFor(store, id);
    if (!runtime) return notFound();
    const { requestId, choice, answer } = body.data;
    const accepted = await runtime.respond(requestId, { choice, answer });
    if (!accepted) return jsonError("This request is no longer waiting for an answer.", 409);
    return NextResponse.json({ ok: true });
  });
}
