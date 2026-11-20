// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * POST /api/webhooks/agentphone: AgentPhone events. Set this URL as the webhook of this app's own sub-account
 * (`POST /v1/webhooks { url }` with `X-Sub-Account-Id: $AGENTPHONE_SUB_ACCOUNT_ID`; never the master account's, whose
 * numbers belong to other products) and keep the agents in `voiceMode: "webhook"`. Its `secret` is AGENTPHONE_WEBHOOK_SECRET.
 * - Voice turns (`agent.message`, channel `voice`) are answered in this response: what the caller hears.
 * - Everything else is acknowledged at once (5 s limit) and handled after the response.
 * The body is not parsed until the HMAC signature over the raw bytes checks out.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/db/mail";
import { vendorConfig } from "@/lib/mail/vendor";
import { verifyAgentPhone, type ApEvent } from "@/lib/phone/agentphone";
import { numberFor, processPhoneEvent, processVoiceEvent } from "@/lib/phone/inbound";

export async function POST(req: NextRequest) {
  const { webhookSecret } = vendorConfig("agentphone");
  if (!webhookSecret) return NextResponse.json({ error: "Phone isn't set up on this server yet." }, { status: 503 });
  const raw = await req.text();
  if (!verifyAgentPhone(raw, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"), webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  let event: ApEvent;
  try {
    event = JSON.parse(raw) as ApEvent;
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }
  if (!event || typeof event.event !== "string" || !event.data || typeof event.data !== "object") return NextResponse.json({ error: "Unexpected payload." }, { status: 400 });
  // Synthetic deliveries from POST /v1/webhooks/test carry "test": true.
  if (event.test) return NextResponse.json(event.channel === "voice" ? { text: "Test received." } : { ok: true });

  // A number this server does not know: acknowledged (no vendor retries) with a clean outcome; a caller hears why.
  if (!(await numberFor(event))) {
    return NextResponse.json(event.channel === "voice" ? { text: "This number is not in service.", hangup: true } : { ok: true, outcome: "not_found" });
  }

  const deliveryId = req.headers.get("x-webhook-id");
  if (deliveryId && !(await claimWebhookEvent("agentphone", deliveryId))) {
    return NextResponse.json(event.channel === "voice" ? { text: "Sorry, could you say that again?" } : { ok: true, duplicate: true });
  }

  if (event.event === "agent.message" && event.channel === "voice") {
    try {
      return NextResponse.json(await processVoiceEvent(event));
    } catch (err) {
      console.error("[phone] voice turn failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ text: "Sorry, something went wrong on my side. Please text me instead." });
    }
  }

  after(async () => {
    try {
      await processPhoneEvent(event);
    } catch (err) {
      console.error("[phone] processing an event failed:", err instanceof Error ? err.message : err);
      if (deliveryId) await releaseWebhookEvent("agentphone", deliveryId).catch(() => undefined);
    }
  });
  return NextResponse.json({ ok: true });
}
