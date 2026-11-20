// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { siteRoute, type IdParams } from "@/lib/websites/http";
import { copyWebsite } from "@/lib/websites/server";

/** POST: "Make a copy": a new site from this one's files, with its own ports. */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json({ site: await copyWebsite(session, row) }, { status: 201 }));
}
