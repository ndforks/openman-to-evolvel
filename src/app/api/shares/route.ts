// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { getShareForTask, upsertShare, type Share } from "@/lib/db/shares";
import { getTaskRow } from "@/lib/db/tasks";

const shareJson = (req: NextRequest, share: Share | null) => ({
  share,
  url: share ? `${req.nextUrl.origin}/share/${share.token}` : null,
});

const schema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  visibility: z.enum(["private", "public"]).default("public"),
});

/** GET /api/shares?taskId=: `{ share, url }`, both null when the task has no link. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => {
    const taskId = req.nextUrl.searchParams.get("taskId") ?? "";
    if (!(await getTaskRow(session.userId, taskId))) return jsonError("Task not found.", 404);
    return NextResponse.json(shareJson(req, await getShareForTask(session.userId, taskId)));
  });
}

/**
 * POST /api/shares `{ taskId, visibility }`: create the task's link or change who can open it
 * (`public`: anyone with the link; `private`: only you, the link stops working). Answers `{ share, url }`.
 */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    if (!(await getTaskRow(session.userId, body.data.taskId))) return jsonError("Task not found.", 404);
    return NextResponse.json(shareJson(req, await upsertShare(session.userId, body.data.taskId, body.data.visibility)));
  });
}
