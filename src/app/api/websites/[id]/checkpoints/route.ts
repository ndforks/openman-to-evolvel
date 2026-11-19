import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { createCheckpoint, listCheckpoints } from "@/lib/websites/server";

/** GET: versions (git commits in the site folder), newest first. */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json({ checkpoints: await listCheckpoints(session, row) }, { headers: noStore }));
}

const schema = z.object({ message: z.string().trim().max(120).optional() });

/** POST `{ message? }`: save the current files as a version, with a screenshot. */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ checkpoints: await createCheckpoint(session, row, body.data.message ?? "") }, { status: 201 });
  });
}
