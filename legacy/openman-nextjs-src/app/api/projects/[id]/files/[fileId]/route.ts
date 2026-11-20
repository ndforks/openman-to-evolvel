// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { deleteProjectFile, readProjectFile } from "@/lib/db/projects";
import { canEditProject, projectAccess } from "@/lib/db/project-members";

type Params = { params: Promise<{ id: string; fileId: string }> };

/** GET /api/projects/[id]/files/[fileId]: the file's bytes, as a download. */
export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id, fileId } = await params;
    const access = await projectAccess(session, id);
    if (!access) return jsonError("File not found.", 404);
    const found = await readProjectFile(access.ownerId, id, fileId);
    if (!found) return jsonError("File not found.", 404);
    const ascii = found.file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(new Uint8Array(found.bytes), {
      headers: {
        "Content-Type": found.file.mime ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(found.file.name)}`,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

/** DELETE /api/projects/[id]/files/[fileId] (owner and editors) */
export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id, fileId } = await params;
    const access = await projectAccess(session, id);
    if (!access) return jsonError("File not found.", 404);
    if (!canEditProject(access.role)) return jsonError("Only the project's owner and editors can change its files.", 403);
    return (await deleteProjectFile(access.ownerId, id, fileId)) ? NextResponse.json({ ok: true }) : jsonError("File not found.", 404);
  });
}
