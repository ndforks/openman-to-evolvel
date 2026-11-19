import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/agent/server/http";
import { listSharedWithMe } from "@/lib/agent/server/collab";

/** GET /api/tasks/shared: tasks other people invited the signed-in caller to collaborate on (sidebar "Shared with you"). */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ tasks: await listSharedWithMe(session) }, { headers: { "Cache-Control": "no-store" } }));
}
