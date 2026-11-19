// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, withSession } from "@/lib/agent/server/http";
import { listMeetings, toMeetingView } from "@/lib/db/meetings";
import { noStore, voiceRoute } from "@/lib/voice/http";
import { beginMeeting } from "@/lib/voice/meetings";

const schema = z.object({
  title: z.string().max(200).optional(),
  source: z.enum(["recording", "upload"]),
  fileName: z.string().trim().min(1).max(255),
  mime: z.string().max(100).nullish(),
  sizeBytes: z.number().int().positive(),
});

/** GET /api/voice/uploads: the caller's recent recordings and uploads, newest first. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ meetings: (await listMeetings(session.userId)).map(toMeetingView) }, noStore));
}

/**
 * POST /api/voice/uploads: start a resumable upload of a recording or audio/video file to the caller's computer.
 * Answers `{ meeting }` with `partSize` and `partsTotal`; send each part to `PUT /api/voice/uploads/{id}/parts/{index}`,
 * then `POST /api/voice/jobs { meetingId }`.
 */
export function POST(req: NextRequest) {
  return withSession(req, (session) =>
    voiceRoute(async () => {
      const body = await readBody(req, schema);
      if ("error" in body) return body.error;
      const meeting = await beginMeeting(session, body.data);
      return NextResponse.json({ meeting: toMeetingView(meeting) }, { status: 201 });
    }),
  );
}
