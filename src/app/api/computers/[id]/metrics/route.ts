import type { NextRequest } from "next/server";
import { readMetrics } from "@/lib/agent/server/cloud";
import { NOT_CONFIGURED, computerScope, json, withUser } from "@/lib/orgo/http";

/** GET /api/computers/[id]/metrics: one live CPU, memory and storage reading. Orgo keeps no history; the page keeps its own. */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json(await readMetrics(scope, id));
  });
}
