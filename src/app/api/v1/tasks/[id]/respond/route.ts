// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, body, ok, storeFor, v1 } from "@/lib/public-api/http";
import { runtimeOr404 } from "@/lib/public-api/tasks";

const schema = z
  .object({
    request_id: z.string().min(1).max(300),
    choice: z.string().max(2000).optional(),
    answer: z.string().max(100_000).optional(),
  })
  .refine((v) => v.choice !== undefined || v.answer !== undefined, "Send `choice` (for an approval) or `answer` (for a question).");

/**
 * POST /api/v1/tasks/{id}/respond `{ request_id, choice? | answer? }`: answer the approval or question the task is waiting on.
 * `request_id` comes from the task's `pending_request` (or the `approval.request` / `question` event).
 */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const b = await body(req, schema);
    const store = await storeFor(ctx.session);
    const runtime = await runtimeOr404(store, id);
    const accepted = await runtime.respond(b.request_id, { choice: b.choice, answer: b.answer });
    if (!accepted) throw new ApiError("conflict", "request_not_pending", "This request is no longer waiting for an answer.", "request_id");
    return ok(ctx, { task_id: id, request_id: b.request_id, accepted: true });
  });
}
