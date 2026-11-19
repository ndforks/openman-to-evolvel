import { NextResponse, type NextRequest } from "next/server";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { siteAnalytics } from "@/lib/websites/stack";

/** GET ?days=7|30|90: visitors, page views, top sources and pages of the published site (logged on the user's computer). */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const days = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("days")) || 30, 90));
    return NextResponse.json(await siteAnalytics(session, row, days), { headers: noStore });
  });
}
