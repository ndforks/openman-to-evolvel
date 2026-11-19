// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { afterParam, idempotent, limitParam, list, rawBody, storeFor, v1, validate } from "@/lib/public-api/http";
import { loadTask, runtimeOr404 } from "@/lib/public-api/tasks";
import { messagesOf } from "@/lib/public-api/views";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/tasks/{id}/messages?after=<seq>&limit=: the conversation (user and assistant messages), oldest first. */
export function GET(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const after = afterParam(req);
    const limit = limitParam(req, 50, 500);
    const store = await storeFor(ctx.session);
    const { events } = await loadTask(ctx, store, id);
    const all = messagesOf(events).filter((m) => m.seq > after);
    const data = all.slice(0, limit);
    const hasMore = all.length > limit;
    return list(ctx, { data, hasMore, nextCursor: hasMore ? String(data[data.length - 1].seq) : null });
  });
}

const sendSchema = z.object({
  text: z.string().trim().min(1, "text is required.").max(200_000),
  mode: z.enum(["queue", "steer", "interrupt"]).default("queue"),
});

/**
 * POST /api/v1/tasks/{id}/messages `{ text, mode? }`: send a follow-up.
 * `queue` (default) runs it after the current run; `steer` hands it to the running agent; `interrupt` stops the run and starts over with it.
 * When nothing is running, every mode starts a new run. Honours `Idempotency-Key`.
 */
export function POST(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const { raw, json } = await rawBody(req);
    const b = validate(json, sendSchema);
    return idempotent(req, ctx, raw, async () => {
      const store = await storeFor(ctx.session);
      const runtime = await runtimeOr404(store, id);
      if (b.mode === "steer") await runtime.steer(b.text);
      else if (b.mode === "interrupt") await runtime.interrupt(b.text);
      else await runtime.queueMessage(b.text);
      return { status: 202, data: { task_id: id, accepted: true, mode: b.mode } };
    });
  });
}
