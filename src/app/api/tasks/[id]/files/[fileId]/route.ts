// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { ComputerError } from "@/lib/agent/server/computer";
import { jsonError, notFound, withTask } from "@/lib/agent/server/http";
import { readTaskFile } from "@/lib/agent/server/files";
import { fileSourceFor } from "@/lib/agent/server/tasks";

const TEXT_TYPE = /^(text\/|application\/(json|xml|sql|x-ndjson|x-ipynb\+json)$|image\/svg\+xml$)/;
/** Types a browser runs or lays out as a page. Shown inline, they get a sandbox so they cannot act as this site. */
const ACTIVE_TYPE = /^(text\/html|image\/svg\+xml|application\/xml)$/;

function disposition(kind: "inline" | "attachment", name: string): string {
  // An ASCII fallback for old clients, then the real name for everything else (RFC 6266).
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * GET /api/tasks/[id]/files/[fileId]: the file's bytes.
 * Shown in the browser by default; `?download=1` sends it as an attachment instead.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  return withTask(req, id, async ({ store }) => {
    const source = await fileSourceFor(store, id);
    if (!source) return notFound();
    let content;
    try {
      content = await readTaskFile(source, fileId);
    } catch (err) {
      if (err instanceof ComputerError) return jsonError(err.message, err.status === 404 || err.status === 413 ? err.status : 502);
      throw err;
    }
    if (!content) return jsonError("File not found.", 404);

    const { file, bytes } = content;
    const download = ["1", "true"].includes(req.nextUrl.searchParams.get("download") ?? "");
    const mime = file.mime ?? "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": TEXT_TYPE.test(mime) ? `${mime}; charset=utf-8` : mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": disposition(download ? "attachment" : "inline", file.name),
      // The agent can write the same path again, so the browser asks every time.
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    };
    // A page the agent wrote is untrusted content served from this origin: scripts may run for a
    // preview, but in an origin of their own, away from the app's cookies and API.
    if (!download && ACTIVE_TYPE.test(mime)) headers["Content-Security-Policy"] = "sandbox allow-scripts allow-popups allow-forms allow-modals";
    return new NextResponse(new Uint8Array(bytes), { headers });
  });
}
