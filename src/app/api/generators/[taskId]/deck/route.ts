import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/agent/server/http";
import { generatorRoute, noStore } from "@/lib/generators/http";
import { deckBundle } from "@/lib/generators/server";

/**
 * GET /api/generators/[taskId]/deck?v=<updatedAt>: the deck manifest plus every slide as one self-contained
 * HTML document (stylesheet and images inlined), for the slide viewer. Cached per `v`.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  return generatorRoute(req, async (store) => {
    const { taskId } = await params;
    const bundle = await deckBundle(store, taskId, req.nextUrl.searchParams.get("v") ?? undefined);
    return bundle ? NextResponse.json(bundle, { headers: noStore }) : jsonError("No deck yet.", 404);
  });
}
