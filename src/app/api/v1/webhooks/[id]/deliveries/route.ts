// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { getEndpoint, listDeliveries } from "@/lib/db/public-api";
import { ApiError, limitParam, list, notFound, v1 } from "@/lib/public-api/http";
import { deliveryView } from "@/lib/public-api/resources";

/**
 * GET /api/v1/webhooks/{id}/deliveries?limit=&cursor=: delivery attempts for this endpoint, newest first,
 * with status (pending, delivered, failed), attempt count, last response code and next retry time.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    if (!(await getEndpoint(ctx.session.userId, id))) throw notFound("Webhook endpoint");
    const limit = limitParam(req, 20, 100);
    const cursor = req.nextUrl.searchParams.get("cursor");
    let before: string | undefined;
    if (cursor) {
      before = Buffer.from(cursor, "base64url").toString("utf8");
      if (Number.isNaN(Date.parse(before))) throw new ApiError("invalid_request", "invalid_cursor", "This cursor is not valid.", "cursor");
    }
    const rows = await listDeliveries(ctx.session.userId, id, { before, limit: limit + 1 });
    const data = rows.slice(0, limit).map(deliveryView);
    const hasMore = rows.length > limit;
    return list(ctx, { data, hasMore, nextCursor: hasMore ? Buffer.from(data[data.length - 1].created_at, "utf8").toString("base64url") : null });
  });
}
