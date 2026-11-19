// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withStore } from "@/lib/agent/server/http";
import { getMeeting, toMeetingView } from "@/lib/db/meetings";
import { noStore, voiceRoute } from "@/lib/voice/http";
import { advanceMeeting } from "@/lib/voice/meetings";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/voice/jobs/[id]: the transcription's state. Each call also moves it on: it reads the job on the
 * caller's computer and, when the transcript is ready, creates the notes task (`meeting.taskId`).
 */
export function GET(req: NextRequest, { params }: Params) {
  return withStore(req, (store, session) =>
    voiceRoute(async () => {
      const { id } = await params;
      if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Not found.", 404);
      const meeting = await getMeeting(session.userId, id);
      if (!meeting) return jsonError("Not found.", 404);
      const next = await advanceMeeting(session, store, meeting);
      return NextResponse.json({ meeting: toMeetingView(next) }, noStore);
    }),
  );
}
