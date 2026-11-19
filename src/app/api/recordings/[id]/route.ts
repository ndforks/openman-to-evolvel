import type { NextRequest } from "next/server";
import { deleteRecording } from "@/lib/db/recordings";
import { json, ok, route } from "@/lib/recording/http";
import { RecordingError, recordingStatus, reviewRecording } from "@/lib/recording/server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/recordings/[id]: the recording with its steps; while processing, the task's state; once done, the skill. */
export function GET(_req: NextRequest, { params }: Ctx) {
  return route("GET /api/recordings/[id]", async (session) => ok(await recordingStatus(session, (await params).id)));
}

/** PATCH /api/recordings/[id] { name?, description?, steps?: [{ id, note? }] }: review edits (keep, order, annotate). */
export function PATCH(req: NextRequest, { params }: Ctx) {
  return route("PATCH /api/recordings/[id]", async (session) => {
    const body = await json<{ name?: unknown; description?: unknown; steps?: unknown }>(req);
    const steps = Array.isArray(body.steps)
      ? body.steps
          .filter((s): s is { id: string; note?: unknown } => !!s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string")
          .map((s) => ({ id: s.id, note: typeof s.note === "string" ? s.note : undefined }))
      : undefined;
    const recording = await reviewRecording(session, (await params).id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      steps,
    });
    return ok({ recording });
  });
}

/** DELETE /api/recordings/[id]: discard the recording, its timeline and screenshots. A skill made from it stays. */
export function DELETE(_req: NextRequest, { params }: Ctx) {
  return route("DELETE /api/recordings/[id]", async (session) => {
    if (!(await deleteRecording(session.userId, (await params).id))) throw new RecordingError("That recording wasn't found.", 404, "not_found");
    return ok({ ok: true });
  });
}
