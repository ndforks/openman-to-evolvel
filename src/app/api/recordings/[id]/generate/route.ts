import type { NextRequest } from "next/server";
import { json, ok, route } from "@/lib/recording/http";
import { generateSkill } from "@/lib/recording/server";

/**
 * POST /api/recordings/[id]/generate { skillName? }: start a task, as the caller, that turns the reviewed recording
 * into a skill. Also regenerates a finished or failed one: the raw recording is kept.
 */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route("POST /api/recordings/[id]/generate", async (session) => {
    const body = await json<{ skillName?: unknown }>(req).catch(() => ({}) as { skillName?: unknown });
    const recording = await generateSkill(session, (await params).id, typeof body.skillName === "string" ? body.skillName : undefined);
    return ok({ recording }, 202);
  });
}
