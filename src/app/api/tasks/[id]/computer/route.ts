import { NextResponse, type NextRequest } from "next/server";
import { taskComputerView } from "@/lib/agent/server/computer-view";
import { notFound, withTask } from "@/lib/agent/server/http";
import { isValidTaskId } from "@/lib/store";

/**
 * GET /api/tasks/[id]/computer: where to watch the computer this task runs on: the computer it was given
 * (`target.kind === "cloud-persistent"`), else the agent's home computer.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The stream URL carries the computer's root password: owners only, never collaborators.
  return withTask(req, id, async ({ store }) => {
    // The stream URL carries the computer's password, so only the task's owner may have it.
    const task = isValidTaskId(id) ? await store.getTask(id) : null;
    if (!task) return notFound();
    const view = await taskComputerView(store.ownerId, task.meta.target);
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  }, { ownerOnly: true });
}
