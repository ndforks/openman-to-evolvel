// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { deleteWebhook, rollWebhookSecret, updateWebhook, WEBHOOK_EVENTS } from "@/lib/personalization/developers";

type Params = { params: Promise<{ id: string }> };
const notFound = () => jsonError("Webhook not found.", 404);

const schema = z.object({
  enabled: z.boolean().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  /** true: replace the signing secret and return the new one once. */
  rollSecret: z.literal(true).optional(),
});

/** PATCH /api/account/webhooks/[id] `{ enabled?, events?, rollSecret? }`: `{ webhook, secret? }`. */
export function PATCH(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const secret = body.data.rollSecret ? await rollWebhookSecret(session.userId, id) : undefined;
    if (secret === null) return notFound();
    const webhook = await updateWebhook(session.userId, id, { enabled: body.data.enabled, events: body.data.events });
    if (!webhook) return notFound();
    return NextResponse.json({ webhook, ...(secret ? { secret } : {}) }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** DELETE /api/account/webhooks/[id]. */
export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    return (await deleteWebhook(session.userId, id)) ? NextResponse.json({ ok: true }) : notFound();
  });
}
