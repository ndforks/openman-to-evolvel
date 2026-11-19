// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { leaveProject } from "@/lib/db/project-members";

/** POST /api/projects/[id]/leave: the caller stops being a member of a project shared with them. Their tasks stay theirs. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSession(req, async (session) => {
    const { id } = await params;
    return (await leaveProject(session, id)) ? NextResponse.json({ ok: true }) : jsonError("This project is not shared with you.", 404);
  });
}
