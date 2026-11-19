import type { NextRequest } from "next/server";
import { afterParam, limitParam, list, storeFor, v1 } from "@/lib/public-api/http";
import { loadTask } from "@/lib/public-api/tasks";
import { eventView } from "@/lib/public-api/views";

/**
 * GET /api/v1/tasks/{id}/events?after=<seq>&limit=&types=a,b: the stored event log, oldest first.
 * `next_cursor` is the seq to pass as `after` for the next page. For live updates use `/stream`.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const after = afterParam(req);
    const limit = limitParam(req, 100, 1000);
    const types = req.nextUrl.searchParams.get("types")?.split(",").map((t) => t.trim()).filter(Boolean);
    const store = await storeFor(ctx.session);
    const { events } = await loadTask(ctx, store, id);
    const all = events.filter((e) => e.seq > after && (!types?.length || types.includes(e.type)));
    const data = all.slice(0, limit).map(eventView);
    const hasMore = all.length > limit;
    return list(ctx, { data, hasMore, nextCursor: hasMore ? String(data[data.length - 1].seq) : null });
  });
}
