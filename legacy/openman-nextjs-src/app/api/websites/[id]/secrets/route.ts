// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { listSecrets, removeSecret, setSecret } from "@/lib/websites/stack";

/** GET: secret names (never values). */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => NextResponse.json({ secrets: await listSecrets(session, row) }, { headers: noStore }));
}

const putSchema = z.object({ name: z.string().trim().min(1).max(64), value: z.string().min(1).max(8192) });

/** PUT { name, value }: save (sealed at rest) and write the site's env file on the computer. The value is never returned. */
export function PUT(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, putSchema);
    if ("error" in body) return body.error;
    return NextResponse.json(await setSecret(session, row, body.data.name, body.data.value), { headers: noStore });
  });
}

const delSchema = z.object({ name: z.string().trim().min(1).max(64) });

/** DELETE { name } */
export function DELETE(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, delSchema);
    if ("error" in body) return body.error;
    return NextResponse.json(await removeSecret(session, row, body.data.name), { headers: noStore });
  });
}
