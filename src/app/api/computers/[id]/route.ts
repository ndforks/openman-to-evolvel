import type { NextRequest } from "next/server";
import { z } from "zod";
import { findComputer, renameComputer } from "@/lib/agent/server/cloud";
import { deleteCloudComputer } from "@/lib/orgo/computers";
import { BadRequest, NOT_CONFIGURED, computerScope, json, readJson, withUser } from "@/lib/orgo/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/computers/[id]: one of the user's computers, as the list shows it. */
export function GET(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json({ computer: await findComputer(scope, id) });
  });
}

const renameSchema = z.object({ name: z.string().min(1).max(80) });

/** PATCH /api/computers/[id] `{ name }`: rename it. Their home computer is refused. */
export function PATCH(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const parsed = renameSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Send a name of 1 to 80 characters.");
    const { id } = await params;
    return json({ computer: await renameComputer(scope, id, parsed.data.name) });
  });
}

/** DELETE /api/computers/[id]: delete one of the user's computers and everything on it. Their home computer is refused. */
export function DELETE(req: NextRequest, { params }: Ctx) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    await deleteCloudComputer(scope, id);
    return json({ ok: true });
  });
}
