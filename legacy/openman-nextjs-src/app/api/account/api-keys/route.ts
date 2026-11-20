// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, withSession } from "@/lib/agent/server/http";
import { API_KEYS_MAX, createApiKey, listApiKeys } from "@/lib/personalization/developers";

/** GET /api/account/api-keys: `{ keys, limit }` (never the secrets). */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ keys: await listApiKeys(session.userId), limit: API_KEYS_MAX }));
}

const schema = z.object({ name: z.string().trim().min(1, "Name the key.").max(100) });

/** POST /api/account/api-keys `{ name }`: `{ key, secret }`. The secret is returned only here, once. */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json(await createApiKey(session.userId, body.data.name), { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}
