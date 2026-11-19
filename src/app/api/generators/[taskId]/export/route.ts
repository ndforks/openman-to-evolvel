import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { generatorRoute } from "@/lib/generators/http";
import { exportDeck } from "@/lib/generators/server";

const schema = z.object({ format: z.enum(["pdf", "pptx", "html"]) });

/**
 * POST /api/generators/[taskId]/export { format: "pdf" | "pptx" | "html" }: exports the deck on the user's
 * computer and answers `{ path, url }` (download URL through the file route). Can take a minute.
 */
export function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  return generatorRoute(req, async (store) => {
    const { taskId } = await params;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const { path } = await exportDeck(store, taskId, body.data.format);
    return NextResponse.json({ path, url: `/api/generators/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(path)}&download=1` });
  });
}
