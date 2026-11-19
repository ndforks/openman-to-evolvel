import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { getWebsiteRow, type WebsiteRow } from "@/lib/db/websites";
import type { Session } from "@/lib/session";
import { OrgoError } from "@/lib/orgo/user-client";
import { SiteError } from "@/lib/websites/server";
import { removeDomain, verifyDomain } from "@/lib/websites/stack";

type Params = { params: Promise<{ id: string; domainId: string }> };

function route(req: NextRequest, ctx: Params, fn: (session: Session, row: WebsiteRow, domainId: string) => Promise<NextResponse>) {
  return withSession(req, async (session) => {
    try {
      const { id, domainId } = await ctx.params;
      const row = await getWebsiteRow(session.userId, id);
      if (!row) return jsonError("Website not found.", 404);
      return await fn(session, row, domainId);
    } catch (err) {
      if (err instanceof SiteError) return jsonError(err.message, err.status);
      if (err instanceof OrgoError) return jsonError(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
      throw err;
    }
  });
}

/** POST: check DNS and turn the domain on (Orgo's verify). */
export function POST(req: NextRequest, ctx: Params) {
  return route(req, ctx, async (session, row, domainId) => NextResponse.json(await verifyDomain(session, row, domainId)));
}

/** DELETE: remove the domain from Orgo. */
export function DELETE(req: NextRequest, ctx: Params) {
  return route(req, ctx, async (session, row, domainId) => {
    await removeDomain(session, row, domainId);
    return NextResponse.json({ ok: true });
  });
}
