import { NextResponse, type NextRequest } from "next/server";
import { siteRoute, type IdParams } from "@/lib/websites/http";
import { publish, unpublish } from "@/lib/websites/server";

/** POST: build, copy to the release folder, serve it on the site's prod port and open its Orgo URL. */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json({ site: await publish(session, row) }));
}

/** DELETE: unpublish (removes the URL and the kept-running service). */
export function DELETE(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json({ site: await unpublish(session, row) }));
}
