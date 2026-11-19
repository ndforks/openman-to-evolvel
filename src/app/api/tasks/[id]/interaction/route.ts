import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, notFound, readBody, withTask } from "@/lib/agent/server/http";
import { runtimeFor } from "@/lib/agent/server/tasks";

const schema = z.object({
  /** Only the full agent can be switched to here: Chat to Agent is one-way, and a confirmed plan runs as Agent. */
  to: z.literal("agent"),
  /** The plan the user confirmed (edited or not). With it, the agent starts carrying it out at once. */
  plan: z.string().trim().min(1).max(50_000).optional(),
});

/**
 * POST /api/tasks/[id]/interaction: "Switch to Agent" on a Chat task (the same conversation continues as a full
 * task), or "Confirm" on a plan card (the task leaves Plan mode and starts on the plan).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store }) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const runtime = await runtimeFor(store, id);
    if (!runtime) return notFound();
    const { plan } = body.data;
    const current = (runtime.task.meta as { interaction?: string }).interaction ?? "agent";
    if (current === "agent" && !plan) return jsonError("This task already runs as an agent.", 409);
    runtime.setInteraction("agent");
    if (plan) await runtime.queueMessage(`I confirmed this plan. Carry it out now, step by step:\n\n${plan}`);
    return NextResponse.json({ ok: true, interaction: "agent" });
  });
}
