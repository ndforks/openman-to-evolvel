import { NextResponse, type NextRequest } from "next/server";
import { ComputerError } from "@/lib/agent/server/computer";
import { readTaskFile } from "@/lib/agent/server/files";
import { fileSourceFor } from "@/lib/agent/server/tasks";
import { ApiError, notFound, storeFor, v1 } from "@/lib/public-api/http";

/** GET /api/v1/tasks/{id}/files/{fileId}: the file's bytes, always as an attachment. */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  return v1(req, async (ctx) => {
    const { id, fileId } = await params;
    const store = await storeFor(ctx.session);
    const source = await fileSourceFor(store, id);
    if (!source) throw notFound("Task");
    let content;
    try {
      content = await readTaskFile(source, fileId);
    } catch (err) {
      if (err instanceof ComputerError) throw new ApiError(err.status === 404 ? "not_found" : err.status === 413 ? "invalid_request" : "upstream_error", err.status === 413 ? "file_too_large" : "file_unavailable", err.message, undefined, err.status === 404 || err.status === 413 ? err.status : 502);
      throw err;
    }
    if (!content) throw notFound("File");
    const { file, bytes } = content;
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...ctx.headers,
        "X-Request-Id": ctx.requestId,
        "Content-Type": file.mime ?? "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
