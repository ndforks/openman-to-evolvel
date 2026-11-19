import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { clearAll, clearSite, normalizeSite } from "@/lib/browser";
import { browserFailure, homeOf, noStore } from "@/lib/browser/route-helpers";

const schema = z.union([z.object({ site: z.string().min(1).max(253) }), z.object({ all: z.literal(true) })]);

/**
 * POST /api/browser/clear { site } | { all: true }: signs the agent browser out of one site (its cookies and its saved
 * vault logins) or out of everything (the whole browser profile and every saved login). Closes the browser first.
 */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema, 4096);
    if ("error" in body) return body.error;
    let site: string | null = null;
    if ("site" in body.data) {
      site = body.data.site === "(no site)" ? "(no site)" : normalizeSite(body.data.site);
      if (!site) return jsonError("That is not a site name.", 400);
    }
    const home = await homeOf(session);
    if (home instanceof NextResponse) return home;
    try {
      const result = site ? await clearSite(home.orgo, home.computerId, site) : await clearAll(home.orgo, home.computerId);
      return NextResponse.json(result, { headers: noStore });
    } catch (err) {
      return browserFailure(err);
    }
  });
}
