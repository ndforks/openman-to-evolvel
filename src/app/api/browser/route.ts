import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/agent/server/http";
import { browserState } from "@/lib/browser";
import { browserFailure, homeOf, noStore } from "@/lib/browser/route-helpers";

/**
 * GET /api/browser: the agent browser on the caller's home computer: whether login state persists across tasks,
 * and the sites with saved sessions (cookie counts and saved-login labels only, never values or passwords).
 */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => {
    const home = await homeOf(session);
    if (home instanceof NextResponse) return home;
    try {
      return NextResponse.json(await browserState(session.userId, home.orgo, home.computerId), { headers: noStore });
    } catch (err) {
      return browserFailure(err);
    }
  });
}
