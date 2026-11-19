import { NextResponse, type NextRequest } from "next/server";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { startPreview, stopPreview, syncWebsite } from "@/lib/websites/server";

/** GET: preview state. */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json(await syncWebsite(session, row), { headers: noStore }));
}

/** POST: wake the computer if it sleeps, start the dev server, open the preview URL. */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json(await startPreview(session, row)));
}

/** DELETE: stop the dev server and remove the preview URL. */
export function DELETE(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json({ site: await stopPreview(session, row) }));
}
