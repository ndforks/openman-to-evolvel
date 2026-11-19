import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { toWebsite } from "@/lib/db/websites";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { deleteWebsite, syncWebsite, updateSettings } from "@/lib/websites/server";
import { setAiEnabled } from "@/lib/websites/stack";

/** GET /api/websites/[id]: `{ site, preview }`, synced with the computer (`?sync=0` skips that). */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    if (req.nextUrl.searchParams.get("sync") === "0") return NextResponse.json({ site: toWebsite(row), preview: null }, { headers: noStore });
    return NextResponse.json(await syncWebsite(session, row, { force: req.nextUrl.searchParams.get("sync") === "force" }), { headers: noStore });
  });
}

const patchSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), autoPublish: z.boolean().optional(), showBadge: z.boolean().optional(), aiEnabled: z.boolean().optional() });

/** PATCH /api/websites/[id]: rename, auto-publish, "Built with" badge, AI features in the built app. */
export function PATCH(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, patchSchema);
    if ("error" in body) return body.error;
    const { aiEnabled, ...rest } = body.data;
    const next = aiEnabled === undefined ? row : await setAiEnabled(session, row, aiEnabled);
    return NextResponse.json({ site: await updateSettings(session, next, rest) });
  });
}

/** DELETE /api/websites/[id]: unpublish, stop the preview, remove the folder and the record. */
export function DELETE(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    await deleteWebsite(session, row);
    return NextResponse.json({ ok: true });
  });
}
