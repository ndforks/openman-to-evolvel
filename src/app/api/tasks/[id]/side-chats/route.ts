import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withTask } from "@/lib/agent/server/http";
import { childrenOf } from "@/lib/agent/server/derive";
import { createTask, viewOf } from "@/lib/agent/server/tasks";
import { extOf } from "@/lib/agent/server/task-meta";

/** GET /api/tasks/[id]/side-chats: the side chats kept with this task, newest first. Owner only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store }) => NextResponse.json({ sideChats: (await childrenOf(store, id, "side")).reverse().map((t) => viewOf(t)) }), { ownerOnly: true });
}

const schema = z.object({ prompt: z.string().trim().min(1, "Write a message first.").max(50_000) });

/**
 * POST /api/tasks/[id]/side-chats: a side chat next to this task. It runs as a Chat-mode conversation of its own that
 * reads the main task's conversation (fresh on every message) and never interrupts the main run. Owner only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(
    req,
    id,
    async ({ store }) => {
      const body = await readBody(req, schema);
      if ("error" in body) return body.error;
      const parent = await store.getTask(id);
      if (!parent) return jsonError("Task not found.", 404);
      if (extOf(parent).childKind === "side") return jsonError("A side chat cannot have side chats of its own.", 400);
      const { prompt } = body.data;
      const task = await createTask(
        store,
        { prompt, mode: parent.meta.mode, effort: parent.meta.effort, speed: parent.meta.speed, interaction: "chat" },
        { title: prompt.split("\n")[0].slice(0, 80), meta: { parentTaskId: parent.id, childKind: "side" } },
      );
      return NextResponse.json({ task }, { status: 201 });
    },
    { ownerOnly: true },
  );
}
