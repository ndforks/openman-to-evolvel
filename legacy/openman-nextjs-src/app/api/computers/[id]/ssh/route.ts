// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { disableSsh, setSshKey, sshInfo } from "@/lib/agent/server/cloud";
import { BadRequest, NOT_CONFIGURED, computerScope, json, readJson, withUser } from "@/lib/orgo/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/computers/[id]/ssh: whether SSH is on and the command to connect (Linux). */
export function GET(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json(await sshInfo(scope, id));
  });
}

const schema = z.object({ publicKey: z.string().min(20).max(16_384) });

/** POST /api/computers/[id]/ssh `{ publicKey }`: turn SSH on with this key (applied at the next restart). */
export function POST(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Paste a public key.");
    const { id } = await params;
    return json(await setSshKey(scope, id, parsed.data.publicKey));
  });
}

/** DELETE /api/computers/[id]/ssh: turn SSH off. */
export function DELETE(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json(await disableSsh(scope, id));
  });
}
