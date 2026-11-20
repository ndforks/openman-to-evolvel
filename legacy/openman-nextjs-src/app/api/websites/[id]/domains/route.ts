// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { addDomain, listDomains } from "@/lib/websites/stack";

/** GET: `{ available, limit, used, domains }` from Orgo's custom domains for the user's plan. */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json(await listDomains(session, row), { headers: noStore }));
}

/** POST { domain }: add it on Orgo, pointed at the published site; answers with the DNS records to set. */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, z.object({ domain: z.string().trim().min(4).max(253) }));
    if ("error" in body) return body.error;
    return NextResponse.json({ domain: await addDomain(session, row, body.data.domain) }, { status: 201 });
  });
}
