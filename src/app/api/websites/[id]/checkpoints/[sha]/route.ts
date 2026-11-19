import { type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { getWebsiteRow } from "@/lib/db/websites";
import { checkpointScreenshot } from "@/lib/websites/server";

/** GET: the screenshot captured for that version (PNG). */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string; sha: string }> }) {
  return withSession(req, async (session) => {
    const { id, sha } = await params;
    const row = await getWebsiteRow(session.userId, id);
    if (!row) return jsonError("Website not found.", 404);
    const png = await checkpointScreenshot(session, row, sha).catch(() => null);
    if (!png) return jsonError("No screenshot for this version.", 404);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400, immutable" } }) as never;
  });
}
