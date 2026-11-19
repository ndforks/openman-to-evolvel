// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { getMeeting, toMeetingView } from "@/lib/db/meetings";
import { voiceRoute } from "@/lib/voice/http";
import { finishUpload, retryMeeting } from "@/lib/voice/meetings";

const schema = z.object({ meetingId: z.string().regex(/^[0-9a-f-]{36}$/i), retry: z.boolean().optional() });

/**
 * POST /api/voice/jobs `{ meetingId }`: every part is in; join them on the computer and start transcribing.
 * `{ meetingId, retry: true }` restarts a failed one. Then poll `GET /api/voice/jobs/{meetingId}`.
 */
export function POST(req: NextRequest) {
  return withSession(req, (session) =>
    voiceRoute(async () => {
      const body = await readBody(req, schema);
      if ("error" in body) return body.error;
      const meeting = await getMeeting(session.userId, body.data.meetingId);
      if (!meeting) return jsonError("Not found.", 404);
      const next = body.data.retry ? await retryMeeting(session, meeting) : await finishUpload(session, meeting);
      return NextResponse.json({ meeting: toMeetingView(next) }, { status: 202 });
    }),
  );
}
