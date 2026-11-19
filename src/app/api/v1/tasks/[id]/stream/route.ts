import { NextResponse, type NextRequest } from "next/server";
import type { AgentEvent } from "@/lib/agent/types";
import { afterParam, v1, storeFor } from "@/lib/public-api/http";
import { runtimeOr404 } from "@/lib/public-api/tasks";
import { eventView, publicStatus } from "@/lib/public-api/views";

const KEEPALIVE_MS = 15_000;
const REST_GRACE_MS = 3000;

/**
 * GET /api/v1/tasks/{id}/stream?after=<seq>: Server-Sent Events.
 * Replays events after `after` (or `Last-Event-ID`), then streams new ones. Frames: `id: <seq>`,
 * `event: <type>`, `data: { seq, type, at, data }`. A `: keepalive` comment every 15 s. When the task is
 * at rest (nothing running or queued) the stream sends `event: end` with the final status and closes.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const store = await storeFor(ctx.session);
    const runtime = await runtimeOr404(store, id);
    const lastId = Number(req.headers.get("last-event-id"));
    const after = Math.max(afterParam(req), Number.isInteger(lastId) && lastId > 0 ? lastId : 0);
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
            send(`event: end\ndata: ${JSON.stringify({ status: publicStatus(runtime.task.status) })}\n\n`);
            close();
          }
        }, 500);
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
        send(`retry: 2000\n: request ${ctx.requestId}\n\n`);
        runtime
          .subscribe(after, (event: AgentEvent) => {
            lastActivity = Date.now();
            send(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(eventView(event))}\n\n`);
          })
          .then((off) => {
            replayed = true;
            if (closed) off();
            else unsubscribe = off;
          })
          .catch(() => close());
      },
      cancel() {
        close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        ...ctx.headers,
        "X-Request-Id": ctx.requestId,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
