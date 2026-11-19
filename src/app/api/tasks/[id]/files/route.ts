import { NextResponse, type NextRequest } from "next/server";
import { notFound, withTask } from "@/lib/agent/server/http";
import { listTaskFiles } from "@/lib/agent/server/files";
import { fileSourceFor } from "@/lib/agent/server/tasks";

/** GET /api/tasks/[id]/files: the files the agent wrote or delivered in this task, oldest first. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store }) => {
    const source = await fileSourceFor(store, id);
    if (!source) return notFound();
    return NextResponse.json({ files: await listTaskFiles(source) }, { headers: { "Cache-Control": "no-store" } });
  });
}
