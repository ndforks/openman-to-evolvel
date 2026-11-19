import type { NextRequest } from "next/server";
import { listBackups } from "@/lib/agent/server/cloud";
import { NOT_CONFIGURED, computerScope, json, withUser } from "@/lib/orgo/http";

/** GET /api/computers/[id]/backups: Orgo's daily backups of this computer (kept 7 days). */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json(await listBackups(scope, id));
  });
}
