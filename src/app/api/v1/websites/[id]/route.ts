import type { NextRequest } from "next/server";
import { getWebsiteRow, toWebsite } from "@/lib/db/websites";
import { notFound, ok, v1 } from "@/lib/public-api/http";
import { websiteView } from "@/lib/public-api/sites";
import { syncWebsite } from "@/lib/websites/server";

/** GET /api/v1/websites/{id}?sync=false: the site and its live status (synced with the computer unless `sync=false`). */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const row = await getWebsiteRow(ctx.session.userId, id);
    if (!row) throw notFound("Website");
    if (req.nextUrl.searchParams.get("sync") === "false") return ok(ctx, { ...websiteView(toWebsite(row)), preview: null });
    const { site, preview } = await syncWebsite(ctx.session, row);
    return ok(ctx, { ...websiteView(site), preview: preview ?? null });
  });
}
