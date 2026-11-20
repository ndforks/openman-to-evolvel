// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * AgentMail REST client: only the calls this app makes, with request and response shapes taken from
 * https://docs.agentmail.to/openapi.json (checked 2026-11-19). Base URL https://api.agentmail.to, /v0 paths.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { safeFetch } from "@/lib/net/safe-fetch";
import { vendorFetch } from "./vendor";

export interface AmPod {
  pod_id: string;
  name: string;
  client_id?: string;
}

export interface AmInbox {
  pod_id: string;
  inbox_id: string;
  email: string;
  display_name?: string;
  client_id?: string;
}

export interface AmAttachmentRef {
  attachment_id: string;
  filename?: string;
  size: number;
  content_type?: string;
  content_disposition?: "inline" | "attachment";
  content_id?: string;
}

/** `message` of a `message.received*` event (events_ReceivedMessage) and the get-message response. */
export interface AmMessage {
  inbox_id: string;
  thread_id: string;
  message_id: string;
  labels: string[];
  timestamp: string;
  from: string;
  reply_to?: string[];
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
  extracted_text?: string;
  extracted_html?: string;
  attachments?: AmAttachmentRef[];
  in_reply_to?: string;
  references?: string[];
  size: number;
  /** Present only when the body was left out of the event (stored body over 64 KiB). */
  body_url?: string;
  body_expires_at?: string;
}

export type AmReceivedType = "message.received" | "message.received.spam" | "message.received.blocked" | "message.received.unauthenticated";

/** events_MessageReceivedEvent: the shape shared by every `message.received*` event. */
export interface AmReceivedEvent {
  type: "event";
  event_type: AmReceivedType;
  event_id: string;
  message: AmMessage;
  thread: { inbox_id: string; thread_id: string; subject?: string; senders?: string[]; recipients?: string[]; message_count?: number };
}

export interface AmOutgoingAttachment {
  filename?: string;
  content_type?: string;
  content_disposition?: "inline" | "attachment";
  /** Base64. The whole request is limited to 6 MB. */
  content?: string;
  /** A URL AgentMail downloads without auth headers (pre-signed URLs are fine). */
  url?: string;
}

const enc = encodeURIComponent;

export const createPod = (body: { name?: string; client_id?: string }) => vendorFetch<AmPod>("agentmail", "POST", "/v0/pods", body);

export const createInbox = (podId: string, body: { username?: string; domain?: string; display_name?: string; client_id?: string; metadata?: Record<string, string | number | boolean> }) =>
  vendorFetch<AmInbox>("agentmail", "POST", `/v0/pods/${enc(podId)}/inboxes`, body);

/** Deletion is asynchronous (202); the address is free once GET returns 404. */
export const deleteInbox = (inboxId: string) => vendorFetch<unknown>("agentmail", "DELETE", `/v0/inboxes/${enc(inboxId)}`);

export const addListEntry = (inboxId: string, direction: "send" | "receive" | "reply", type: "allow" | "block", entry: string, reason?: string) =>
  vendorFetch<unknown>("agentmail", "POST", `/v0/inboxes/${enc(inboxId)}/lists/${direction}/${type}`, reason ? { entry, reason } : { entry });

export const deleteListEntry = (inboxId: string, direction: "send" | "receive" | "reply", type: "allow" | "block", entry: string) =>
  vendorFetch<unknown>("agentmail", "DELETE", `/v0/inboxes/${enc(inboxId)}/lists/${direction}/${type}/${enc(entry)}`);

export const getMessage = (inboxId: string, messageId: string) => vendorFetch<AmMessage>("agentmail", "GET", `/v0/inboxes/${enc(inboxId)}/messages/${enc(messageId)}`);

export const getAttachment = (inboxId: string, messageId: string, attachmentId: string) =>
  vendorFetch<{ attachment_id: string; filename?: string; size: number; content_type?: string; download_url: string; text_url?: string; expires_at: string }>(
    "agentmail",
    "GET",
    `/v0/inboxes/${enc(inboxId)}/messages/${enc(messageId)}/attachments/${enc(attachmentId)}`,
  );

export const replyToMessage = (
  inboxId: string,
  messageId: string,
  body: { text: string; html: string; attachments?: AmOutgoingAttachment[]; reply_all?: boolean; headers?: Record<string, string> },
  idempotencyKey?: string,
) =>
  vendorFetch<{ message_id: string; thread_id: string }>("agentmail", "POST", `/v0/inboxes/${enc(inboxId)}/messages/${enc(messageId)}/reply`, body, {
    timeoutMs: 60_000,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });

/** The stored body behind `body_url` (pre-signed, no auth). */
export async function fetchBodyUrl(url: string): Promise<Pick<AmMessage, "text" | "html" | "extracted_text" | "extracted_html">> {
  // The URL arrives in a (signed) vendor event; it is still fetched only through safeFetch (public hosts, bounded).
  const res = await safeFetch(url, { timeoutMs: 15_000, maxBytes: 10 * 1024 * 1024, allowPrivate: process.env.NODE_ENV !== "production" });
  if (!res.ok) throw new Error(`body_url returned ${res.status}`);
  return (await res.json()) as Pick<AmMessage, "text" | "html" | "extracted_text" | "extracted_html">;
}

/**
 * Svix signature check (AgentMail delivers webhooks through Svix): HMAC-SHA256 over
 * `{svix-id}.{svix-timestamp}.{raw body}` keyed with the base64 part of the `whsec_` secret, compared
 * with each `v1,<base64>` entry of `svix-signature`. Timestamps more than 5 minutes off are refused.
 */
export function verifySvix(rawBody: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, nowSec = Date.now() / 1000): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

/** `Display Name <user@domain>` or `user@domain` -> lower-cased address. */
export function addressOf(raw: string | undefined | null): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}
