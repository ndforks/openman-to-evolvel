// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { deleteMeeting, getMeeting, toMeetingView } from "@/lib/db/meetings";
import { noStore } from "@/lib/voice/http";

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

/** GET /api/voice/uploads/[id]: the upload's state, including `partsDone`, so a reloaded page resumes where it stopped. */
export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const meeting = UUID.test(id) ? await getMeeting(session.userId, id) : null;
    return meeting ? NextResponse.json({ meeting: toMeetingView(meeting) }, noStore) : jsonError("Not found.", 404);
  });
}

/** DELETE /api/voice/uploads/[id]: forget an upload (the audio stays on the computer until its folder is cleared). */
export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const ok = UUID.test(id) && (await deleteMeeting(session.userId, id));
    return ok ? NextResponse.json({ ok: true }) : jsonError("Not found.", 404);
  });
}
