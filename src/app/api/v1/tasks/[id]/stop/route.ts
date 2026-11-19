import type { NextRequest } from "next/server";
import { getApiTask } from "@/lib/db/public-api";
import { ok, storeFor, v1 } from "@/lib/public-api/http";
import { runtimeOr404 } from "@/lib/public-api/tasks";
import { taskView } from "@/lib/public-api/views";
import { toSummary } from "@/lib/store";

/** POST /api/v1/tasks/{id}/stop: stops the current run and drops queued messages. A finished task is left as is. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const store = await storeFor(ctx.session);
    const runtime = await runtimeOr404(store, id);
    await runtime.stop();
    return ok(ctx, taskView(toSummary(runtime.task), await getApiTask(ctx.session.userId, id)));
  });
}
