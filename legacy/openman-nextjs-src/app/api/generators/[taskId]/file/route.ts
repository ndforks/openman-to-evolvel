// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, notFound } from "@/lib/agent/server/http";
import { mimeFor } from "@/lib/agent/server/files";
import { generatorRoute } from "@/lib/generators/http";
import { readGeneratorFile } from "@/lib/generators/server";

const TEXT_TYPE = /^(text\/|application\/(json|xml|sql|x-ndjson)$|image\/svg\+xml$)/;
const ACTIVE_TYPE = /^(text\/html|image\/svg\+xml|application\/xml)$/;

function disposition(kind: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * GET /api/generators/[taskId]/file?path=<relative path>: a file inside a generator task's folder (charts,
 * tables, exports, audio). `&download=1` sends it as an attachment. Pages the agent wrote are sandboxed.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  return generatorRoute(req, async (store) => {
    const { taskId } = await params;
    const rel = req.nextUrl.searchParams.get("path") ?? "";
    if (!rel) return jsonError("Name a file.", 400);
    const file = await readGeneratorFile(store, taskId, rel);
    if (!file) return notFound();
    const mime = mimeFor(file.name) ?? "application/octet-stream";
    const download = ["1", "true"].includes(req.nextUrl.searchParams.get("download") ?? "");
    const headers: Record<string, string> = {
      "Content-Type": TEXT_TYPE.test(mime) ? `${mime}; charset=utf-8` : mime,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": disposition(download ? "attachment" : "inline", file.name),
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    };
    if (!download && ACTIVE_TYPE.test(mime)) headers["Content-Security-Policy"] = "sandbox allow-scripts allow-popups";
    return new NextResponse(new Uint8Array(file.bytes), { headers });
  });
}
