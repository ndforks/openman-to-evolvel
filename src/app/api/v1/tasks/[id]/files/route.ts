import type { NextRequest } from "next/server";
import { listTaskFiles } from "@/lib/agent/server/files";
import { fileSourceFor } from "@/lib/agent/server/tasks";
import { baseUrl, list, notFound, paginate, storeFor, v1 } from "@/lib/public-api/http";

/** GET /api/v1/tasks/{id}/files: files the agent wrote or delivered, oldest first, with download URLs. */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const store = await storeFor(ctx.session);
    const source = await fileSourceFor(store, id);
    if (!source) throw notFound("Task");
    const base = baseUrl(req);
    const files = (await listTaskFiles(source)).map((f) => ({
      id: f.fileId,
      object: "file" as const,
      task_id: id,
      name: f.name,
      mime: f.mime ?? null,
      size: f.size ?? null,
      created_at: f.at ?? null,
      download_url: `${base}/api/v1/tasks/${id}/files/${encodeURIComponent(f.fileId)}`,
    }));
    return list(ctx, paginate(files, req, (f) => f.id, 100));
  });
}
