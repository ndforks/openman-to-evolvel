import type { NextRequest } from "next/server";
import { z } from "zod";
import { countRecordingImages, putRecordingImage, putRecordingPart } from "@/lib/db/recordings";
import { json, ok, route } from "@/lib/recording/http";
import { RecordingError, requireRecording } from "@/lib/recording/server";
import { LIMITS, type RecordedStep } from "@/lib/recording/types";

const frac = z.number().finite().min(0).max(1);
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);

const step = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  t: z.number().finite().min(0).max(24 * 3600_000),
  kind: z.enum(["click", "double_click", "right_click", "drag", "scroll", "type", "key", "paste", "pause"]),
  x: frac.optional(),
  y: frac.optional(),
  x2: frac.optional(),
  y2: frac.optional(),
  text: z.string().max(4000).optional(),
  redacted: z.boolean().optional(),
  keys: z.string().max(80).optional(),
  count: z.number().int().min(1).max(10_000).optional(),
  dx: z.number().finite().min(-100_000).max(100_000).optional(),
  dy: z.number().finite().min(-100_000).max(100_000).optional(),
  window: z.string().max(200).nullish(),
  before: key.nullish(),
  after: key.nullish(),
});

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("events"), seq: z.number().int().min(0).max(LIMITS.parts - 1), events: z.array(step).max(LIMITS.eventsPerPart) }),
  z.object({
    kind: z.literal("image"),
    key,
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    width: z.number().int().min(1).max(8000).optional(),
    height: z.number().int().min(1).max(8000).optional(),
    data: z.string().max(Math.ceil((LIMITS.imageBytes * 4) / 3) + 8).regex(/^[A-Za-z0-9+/=]+$/),
  }),
]);

/**
 * POST /api/recordings/[id]/parts: one upload while recording.
 * `{ kind: "events", seq, events }` stores part `seq` of the timeline (re-sending a seq replaces it);
 * `{ kind: "image", key, mime, width?, height?, data }` stores one screenshot (base64).
 */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route("POST /api/recordings/[id]/parts", async (session) => {
    const { id } = await params;
    const parsed = body.safeParse(await json(req));
    if (!parsed.success) throw new RecordingError(`Invalid part: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message ?? ""}`.trim());
    const rec = await requireRecording(session, id);
    // Parts that were in flight when Stop was pressed still land; nothing is accepted once processing started.
    if (rec.status !== "recording" && rec.status !== "review") throw new RecordingError("This recording is no longer taking uploads.", 409, "closed");
    const part = parsed.data;
    if (part.kind === "events") {
      await putRecordingPart(session.userId, id, part.seq, part.events as RecordedStep[]);
    } else {
      if ((await countRecordingImages(session.userId, id)) >= LIMITS.images) throw new RecordingError("This recording has as many screenshots as it can hold.", 413, "too_many");
      await putRecordingImage(session.userId, id, part);
    }
    return ok({ ok: true });
  });
}
