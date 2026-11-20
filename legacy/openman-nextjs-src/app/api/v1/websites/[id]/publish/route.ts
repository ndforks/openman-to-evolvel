// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { getWebsiteRow } from "@/lib/db/websites";
import { notFound, ok, v1 } from "@/lib/public-api/http";
import { websiteView } from "@/lib/public-api/sites";
import { publish, unpublish } from "@/lib/websites/server";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/websites/{id}/publish: build the current version and serve it at its published URL. */
export function POST(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const row = await getWebsiteRow(ctx.session.userId, id);
    if (!row) throw notFound("Website");
    return ok(ctx, websiteView(await publish(ctx.session, row)));
  });
}

/** DELETE /api/v1/websites/{id}/publish: unpublish (removes the public URL). */
export function DELETE(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const row = await getWebsiteRow(ctx.session.userId, id);
    if (!row) throw notFound("Website");
    return ok(ctx, websiteView(await unpublish(ctx.session, row)));
  });
}
