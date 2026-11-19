import type { NextRequest } from "next/server";
import { listWebsiteRows, toWebsite } from "@/lib/db/websites";
import { list, paginate, v1 } from "@/lib/public-api/http";
import { websiteView } from "@/lib/public-api/sites";

/** GET /api/v1/websites: sites the agent built for this account, newest first. */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const sites = (await listWebsiteRows(ctx.session.userId)).map((r) => websiteView(toWebsite(r)));
    return list(ctx, paginate(sites, req, (s) => s.id, 50));
  });
}
