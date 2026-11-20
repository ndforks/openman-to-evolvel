// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { getMeeting, toMeetingView } from "@/lib/db/meetings";
import { voiceRoute } from "@/lib/voice/http";
import { receivePart } from "@/lib/voice/meetings";
import { PART_SIZE } from "@/lib/voice/providers";
import { BodyTooLarge, readLimited } from "@/lib/net/body";

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * PUT /api/voice/uploads/[id]/parts/[index]: one part of the file as the raw request body (at most `partSize`
 * bytes). It is placed on the caller's computer; sending the same part again replaces it.
 */
export function PUT(req: NextRequest, { params }: Params) {
  return withSession(req, (session) =>
    voiceRoute(async () => {
      const { id, index } = await params;
      if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,6}$/.test(index)) return jsonError("Not found.", 404);
      const declared = Number(req.headers.get("content-length") ?? 0);
      if (declared > PART_SIZE) return jsonError("Part too large.", 413);
      const meeting = await getMeeting(session.userId, id);
      if (!meeting) return jsonError("Not found.", 404);
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readLimited(req, PART_SIZE)); // never buffers more than one part
      } catch (err) {
        if (err instanceof BodyTooLarge) return jsonError("Part too large.", 413);
        throw err;
      }
      const updated = await receivePart(session, meeting, Number(index), bytes);
      return NextResponse.json({ meeting: toMeetingView(updated) });
    }),
  );
}
