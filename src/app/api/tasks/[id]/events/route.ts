// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import type { AgentEvent } from "@/lib/agent/types";
import { notFound, withTask } from "@/lib/agent/server/http";
import { runtimeFor } from "@/lib/agent/server/tasks";

const KEEPALIVE_MS = 15_000;
/**
 * How long a stream stays open with nothing running. Long enough for a message sent right after
 * the stream was opened to start its run, short enough that a finished task lets go of the connection.
 */
const REST_GRACE_MS = 3000;
const REST_CHECK_MS = 500;

function parseSeq(value: string | null): number {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * GET /api/tasks/[id]/events?after=<seq>: Server-Sent Events.
 * Replays stored events with `seq > after`, then sends new ones as they happen, across queued
 * and follow-up runs too. Each frame is `id: <seq>` plus `data: <AgentEvent json>`; a comment
 * line goes out every 15 s so idle connections are not cut. On an automatic reconnect the
 * browser's `Last-Event-ID` header wins over `after` when it is further along.
 *
 * The stream ends on its own once the task is at rest (nothing running, nothing queued): a last
 * `event: end` frame, then the connection closes. A task that finished long ago therefore gets
 * its stored events and a clean end a few seconds later. Open a new stream before sending the
 * next message.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store }) => {
    const runtime = await runtimeFor(store, id);
    if (!runtime) return notFound();

    const after = Math.max(parseSeq(req.nextUrl.searchParams.get("after")), parseSeq(req.headers.get("last-event-id")));
    const encoder = new TextEncoder();
    let close = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let unsubscribe: (() => void) | undefined;
        let replayed = false;
        let lastActivity = Date.now();
        const send = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            close();
          }
        };
        const keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
        const rest = setInterval(() => {
          if (!replayed || !runtime.atRest) lastActivity = Date.now();
          else if (Date.now() - lastActivity >= REST_GRACE_MS) {
            send(`event: end\ndata: ${JSON.stringify({ status: runtime.task.status })}\n\n`);
            close();
          }
        }, REST_CHECK_MS);
        close = () => {
          if (closed) return;
          closed = true;
          clearInterval(keepalive);
          clearInterval(rest);
          unsubscribe?.();
          req.signal.removeEventListener("abort", close);
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        };
        req.signal.addEventListener("abort", close, { once: true });

        // Sent first so the browser gets the response head before the first real event.
        send("retry: 2000\n: open\n\n");
        runtime
          .subscribe(after, (event: AgentEvent) => {
            lastActivity = Date.now();
            send(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
          })
          .then((off) => {
            replayed = true;
            if (closed) off();
            else unsubscribe = off;
          })
          .catch((err) => {
            console.error(`[api] event stream for task ${id} failed:`, err);
            close();
          });
      },
      cancel() {
        close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        // no-transform keeps proxies and compression from buffering the stream.
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
