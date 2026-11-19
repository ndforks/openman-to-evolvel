import type { NextRequest } from "next/server";
import { BadRequest, json, withUser } from "@/lib/orgo/http";
import { upgradeUrl } from "@/lib/orgo/user-client";

/**
 * GET /api/billing/upgrade-url?tier=starter|growth|scale -> `{ url }`: orgo.ai's Plan & billing page with that plan marked.
 * Plans change on Orgo's own page, where the person confirms the charge (never through `/api/checkout` with a key).
 */
export function GET(req: NextRequest) {
  return withUser(req, async () => {
    const url = upgradeUrl(req.nextUrl.searchParams.get("tier") ?? "");
    if (!url) throw new BadRequest("tier must be starter, growth or scale.");
    return json({ url });
  });
}
