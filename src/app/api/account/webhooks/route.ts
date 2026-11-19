// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { webhookUrlProblem } from "@/lib/public-api/webhooks";
import { createWebhook, listWebhooks, WEBHOOK_EVENTS, WEBHOOKS_MAX } from "@/lib/personalization/developers";

/** GET /api/account/webhooks: `{ webhooks, events, limit }`. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ webhooks: await listWebhooks(session.userId), events: WEBHOOK_EVENTS, limit: WEBHOOKS_MAX }));
}

const webhookUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Enter a full URL.")
  .refine((u) => u.startsWith("https://"), "Use an https:// URL.");

const schema = z.object({ url: webhookUrl, events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Pick at least one event.").default([...WEBHOOK_EVENTS]) });

/** POST /api/account/webhooks `{ url, events? }`: `{ webhook, secret }`. The signing secret is returned only here. */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const bad = await webhookUrlProblem(body.data.url);
    if (bad) return jsonError(bad, 400);
    return NextResponse.json(await createWebhook(session.userId, body.data.url, body.data.events), { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}
