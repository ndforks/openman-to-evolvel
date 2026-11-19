import type { NextRequest } from "next/server";
import { findChangeable } from "@/lib/agent/server/cloud";
import { mintTicket } from "@/lib/agent/server/terminal";
import { NOT_CONFIGURED, computerScope, json, withUser } from "@/lib/orgo/http";

/**
 * POST /api/computers/[id]/terminal: a ticket for one terminal stream (single use, 30 seconds, bound to this
 * user and computer). The browser never gets the computer's credential; see `lib/agent/server/terminal.ts`.
 */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    const computer = await findChangeable(scope, id);
    if (computer.status !== "running") return json({ error: "Start the computer to open a terminal." }, 409);
    return json(mintTicket(ctx.session.userId, computer.id));
  });
}
