// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { siteRoute, type IdParams } from "@/lib/websites/http";
import { setVisibility } from "@/lib/websites/server";

const schema = z.object({ visibility: z.enum(["public", "invite", "private"]), emails: z.array(z.string().email()).max(50).optional() });

/** PUT `{ visibility, emails? }`: public = Orgo link, invite = people (emailed code), private = team. */
export function PUT(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ site: await setVisibility(session, row, body.data.visibility, body.data.emails) });
  });
}
