import { NextResponse, type NextRequest } from "next/server";
import { withTask } from "@/lib/agent/server/http";
import { childrenOf } from "@/lib/agent/server/derive";
import { viewOf } from "@/lib/agent/server/tasks";
import type { AgentEvent } from "@/lib/agent/types";

const lastReply = (events: AgentEvent[]) => {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "message.completed" && e.text.trim()) return e.text.trim();
  }
  return "";
};

/** GET /api/tasks/[id]/children: the parallel tasks this task started, with status and a short result. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store, role }) => {
    const kids = await childrenOf(store, id, "parallel");
    const tasks = await Promise.all(
      kids.map(async (k) => {
        const reply = ["completed", "stopped", "error"].includes(k.status) ? lastReply(await store.listEvents(k.id)) : "";
        return { ...viewOf(k, role), result: reply.slice(0, 280) };
      }),
    );
    return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
  });
}
