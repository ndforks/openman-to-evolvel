import type { NextRequest } from "next/server";
import { listRecordings } from "@/lib/db/recordings";
import { json, ok, route } from "@/lib/recording/http";
import { startRecording } from "@/lib/recording/server";
import { OPEN_STATUSES } from "@/lib/recording/types";

/** GET /api/recordings[?open=1]: the caller's recordings, newest first (`open=1`: only those not yet delivered). */
export function GET(req: NextRequest) {
  return route("GET /api/recordings", async (session) => {
    const open = req.nextUrl.searchParams.get("open") === "1";
    return ok({ recordings: await listRecordings(session.userId, open ? { statuses: OPEN_STATUSES } : {}) });
  });
}

/**
 * POST /api/recordings { name, screenW?, screenH? }: start a recording on the caller's home computer.
 * 409 `open_recording` (with `recording`) while another one is still to be delivered or discarded.
 */
export function POST(req: NextRequest) {
  return route("POST /api/recordings", async (session) => {
    const body = await json<{ name?: unknown; screenW?: unknown; screenH?: unknown }>(req);
    const dim = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 320 && v <= 7680 ? v : undefined);
    const recording = await startRecording(session, { name: typeof body.name === "string" ? body.name : "", screenW: dim(body.screenW), screenH: dim(body.screenH) });
    return ok({ recording }, 201);
  });
}
