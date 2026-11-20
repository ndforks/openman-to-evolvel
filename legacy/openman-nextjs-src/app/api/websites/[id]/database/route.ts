// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { noStore, siteRoute, type IdParams } from "@/lib/websites/http";
import { databaseRequest } from "@/lib/websites/stack";

const ident = z.string().min(1).max(128);
const value = z.union([z.string().max(100_000), z.number(), z.boolean(), z.null()]);
const values = z.record(ident, value);
const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("tables") }),
  z.object({ op: z.literal("schema"), table: ident }),
  z.object({ op: z.literal("rows"), table: ident, limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() }),
  z.object({ op: z.literal("insert"), table: ident, values }),
  z.object({ op: z.literal("update"), table: ident, rowid: z.number().int(), values }),
  z.object({ op: z.literal("delete"), table: ident, rowid: z.number().int() }),
]);

/**
 * POST { op, ... }: the site's database on the user's computer (tables, schema, rows, insert, update, delete).
 * Executed by the kit's helper with bound parameters; table and column names must exist in the database's schema.
 */
export function POST(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json(await databaseRequest(session, row, body.data), { headers: noStore });
  });
}
