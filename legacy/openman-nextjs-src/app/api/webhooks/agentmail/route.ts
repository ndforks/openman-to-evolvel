// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * POST /api/webhooks/agentmail: AgentMail events (delivered by Svix).
 * Register one webhook scoped to this app's pod (`POST /v0/pods/{AGENTMAIL_POD_ID}/webhooks`, never organization-wide)
 * pointing here with event types message.received, message.received.blocked, message.received.unauthenticated,
 * message.received.spam; its `secret` is AGENTMAIL_WEBHOOK_SECRET.
 * The body is not read as JSON (or trusted) until the signature over the raw bytes checks out.
 * An event for an inbox this server does not know (e.g. the laptop's inboxes share the pod with staging) is
 * acknowledged with `{ ok: true, outcome: "not_found" }` so the vendor does not retry it.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { claimWebhookEvent, findMailboxByInbox, releaseWebhookEvent } from "@/lib/db/mail";
import { addressOf, verifySvix, type AmReceivedEvent } from "@/lib/mail/agentmail";
import { processMailEvent } from "@/lib/mail/inbound";
import { vendorConfig } from "@/lib/mail/vendor";

const RECEIVED = new Set(["message.received", "message.received.spam", "message.received.blocked", "message.received.unauthenticated"]);

export async function POST(req: NextRequest) {
  const { webhookSecret } = vendorConfig("agentmail");
  if (!webhookSecret) return NextResponse.json({ error: "Email isn't set up on this server yet." }, { status: 503 });
  const raw = await req.text();
  const ok = verifySvix(raw, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, webhookSecret);
  if (!ok) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let event: AmReceivedEvent;
  try {
    event = JSON.parse(raw) as AmReceivedEvent;
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }
  if (!event?.event_id || typeof event.event_type !== "string") return NextResponse.json({ error: "Missing event_id." }, { status: 400 });
  if (!RECEIVED.has(event.event_type)) return NextResponse.json({ ok: true, ignored: event.event_type });
  const inboxId = typeof event.message?.inbox_id === "string" ? event.message.inbox_id : "";
  if (!inboxId || !event.message?.message_id) return NextResponse.json({ error: "Missing message." }, { status: 400 });
  // Mail to an automation trigger address is routed by the automations engine; anything else needs one of our inboxes.
  const toTrigger = [...(event.message.to ?? []), ...(event.message.cc ?? [])].some((r) => addressOf(r).startsWith("auto-"));
  if (!toTrigger && !(await findMailboxByInbox(inboxId))) return NextResponse.json({ ok: true, outcome: "not_found" });

  // De-duplicate on the payload's event_id (svix-id differs between org, pod and inbox webhooks).
  if (!(await claimWebhookEvent("agentmail", event.event_id))) return NextResponse.json({ ok: true, duplicate: true });

  // Acknowledge now (AgentMail wants a 2xx within 15 s); the work runs after the response.
  after(async () => {
    try {
      await processMailEvent(event);
    } catch (err) {
      console.error("[mail] processing an inbound event failed:", err instanceof Error ? err.message : err);
      // Let a retry of the same event try again.
      await releaseWebhookEvent("agentmail", event.event_id).catch(() => undefined);
    }
  });
  return NextResponse.json({ ok: true });
}
