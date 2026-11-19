import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getEndpoint } from "@/lib/db/public-api";
import { notFound, ok, v1 } from "@/lib/public-api/http";
import { deliverDue, emit } from "@/lib/public-api/webhooks";

/** POST /api/v1/webhooks/{id}/test: queues a signed `ping` event to this endpoint and attempts it at once. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    if (!(await getEndpoint(ctx.session.userId, id))) throw notFound("Webhook endpoint");
    const key = `ping:${id}:${randomBytes(8).toString("hex")}`;
    const queued = await emit(ctx.session.userId, key, "ping", { message: "This is a test event.", webhook_id: id }, id);
    await deliverDue().catch(() => undefined);
    return ok(ctx, { webhook_id: id, queued: queued > 0 }, 202);
  });
}
