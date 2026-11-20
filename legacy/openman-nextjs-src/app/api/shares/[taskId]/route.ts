// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { getShareForTask, revokeShare } from "@/lib/db/shares";

type Params = { params: Promise<{ taskId: string }> };

/** GET /api/shares/[taskId]: `{ share, url }` for the task, both null when it has no link. */
export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { taskId } = await params;
    const share = await getShareForTask(session.userId, taskId);
    return NextResponse.json({ share, url: share ? `${req.nextUrl.origin}/share/${share.token}` : null });
  });
}

/** DELETE /api/shares/[taskId]: revoke the link. Sharing again later makes a new one. */
export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { taskId } = await params;
    return (await revokeShare(session.userId, taskId)) ? NextResponse.json({ ok: true }) : jsonError("This task has no share link.", 404);
  });
}
