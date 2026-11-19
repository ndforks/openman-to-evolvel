// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { resizeComputer, resizeInfo } from "@/lib/agent/server/cloud";
import { BadRequest, NOT_CONFIGURED, computerScope, json, readJson, withUser } from "@/lib/orgo/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/computers/[id]/resize: the catalog sizes this computer can move to. */
export function GET(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json(await resizeInfo(scope, id));
  });
}

const schema = z.object({ size: z.string().min(1).max(20) });

/** PATCH /api/computers/[id]/resize `{ size }`: move to a catalog size (running computers only). */
export function PATCH(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Send a size.");
    const { id } = await params;
    return json({ computer: await resizeComputer(scope, id, parsed.data.size) });
  });
}
