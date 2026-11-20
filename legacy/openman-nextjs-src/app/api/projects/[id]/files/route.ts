// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { addProjectFile, listProjectFiles, PROJECT_FILE_MAX_BYTES } from "@/lib/db/projects";
import { canEditProject, projectAccess } from "@/lib/db/project-members";
import { readFormLimited } from "@/lib/net/body";

type Params = { params: Promise<{ id: string }> };

const jsonSchema = z.object({
  name: z.string().trim().min(1).max(300),
  mime: z.string().max(200).nullish(),
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

/** GET /api/projects/[id]/files: the project's reference files (no content). */
export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const access = await projectAccess(session, id);
    if (!access) return jsonError("Project not found.", 404);
    return NextResponse.json({ files: await listProjectFiles(access.ownerId, id) });
  });
}

/**
 * POST /api/projects/[id]/files: add a file, up to 2 MB, 50 per project. Either multipart form
 * data with a `file` field (owner and editors; files apply to tasks created afterwards), or JSON `{ name, mime?, content, encoding: "utf8" | "base64" }`.
 */
export function POST(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const access = await projectAccess(session, id);
    if (!access) return jsonError("Project not found.", 404);
    if (!canEditProject(access.role)) return jsonError("Only the project's owner and editors can change its files.", 403);
    let name: string;
    let mime: string | null;
    let bytes: Uint8Array;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await readFormLimited(req, PROJECT_FILE_MAX_BYTES + 256 * 1024).catch(() => null); // limited before buffering
      const file = form?.get("file");
      if (!file || typeof file === "string") return jsonError("Send the file in a `file` field.", 400);
      if (file.size > PROJECT_FILE_MAX_BYTES) return jsonError("The file is larger than 2 MB.", 413);
      name = file.name || "file";
      mime = file.type || null;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const parsed = jsonSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return jsonError("Send `{ name, content }` or a multipart `file`.", 400);
      name = parsed.data.name;
      mime = parsed.data.mime ?? null;
      bytes = Buffer.from(parsed.data.content, parsed.data.encoding === "base64" ? "base64" : "utf8");
    }
    const file = await addProjectFile(access.ownerId, id, { name, mime, bytes });
    return NextResponse.json({ file }, { status: 201 });
  });
}
