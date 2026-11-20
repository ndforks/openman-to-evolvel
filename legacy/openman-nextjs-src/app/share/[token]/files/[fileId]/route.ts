// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { ComputerError } from "@/lib/agent/server/computer";
import { primeConnectionFor } from "@/lib/agent/server/connection";
import { readTaskFile } from "@/lib/agent/server/files";
import { resolveShareToken } from "@/lib/db/shares";
import { getTaskRow, listTaskEvents } from "@/lib/db/tasks";

type Params = { params: Promise<{ token: string; fileId: string }> };

const missing = () => NextResponse.json({ error: "File not found." }, { status: 404 });

/** GET /share/[token]/files/[fileId]: a file of a publicly shared task, always as a download. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { token, fileId } = await params;
  try {
    const share = await resolveShareToken(token);
    if (!share) return missing();
    const task = await getTaskRow(share.userId, share.taskId);
    if (!task) return missing();
    await primeConnectionFor(share.userId);
    const content = await readTaskFile({ task, ownerId: share.userId, events: () => listTaskEvents(share.userId, share.taskId) }, fileId);
    if (!content) return missing();
    const { file, bytes } = content;
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mime ?? "application/octet-stream",
        "Content-Length": String(bytes.length),
        // Always a download: shared files are untrusted content and must not render as this site.
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ComputerError) return missing();
    console.error("[share] file failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
