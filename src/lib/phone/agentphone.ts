/**
 * AgentPhone REST client: only the calls this app makes, shapes from https://docs.agentphone.ai/openapi.json
 * and the guides (re-checked against the live API 2026-11-19). Base URL https://api.agentphone.ai, /v1 paths.
 * Every call carries `X-Sub-Account-Id` (this app's own sub-account; added by `vendorFetch`), so agents, numbers,
 * messages and the webhook live apart from the master account's numbers and settings.
 *
 * Prices (AgentPhone standard rates, docs.agentphone.ai/usage, 2026-11-19): a US/Canada number is $3.00 every 30 days,
 * charged from the master account's credit balance when bought; SMS $0.02 per segment in and out; voice in webhook mode
 * $0.13/min. Sending SMS to US numbers needs an approved 10DLC campaign registered in the same sub-account
 * (`POST /v1/register`, $25 one-time for sole proprietor or standard brand, $70 high volume); until then
 * `outboundSms` is `registration_required` and only inbound texts and calls work.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { vendorFetch } from "@/lib/mail/vendor";

export interface ApAgent {
  id: string;
  name: string;
  voiceMode?: "webhook" | "hosted";
}

export interface ApNumber {
  id: string;
  phoneNumber: string;
  country?: string;
  status?: string;
  agentId?: string | null;
  /** `enabled` | `activating` | `registration_required` (US SMS needs a 10DLC campaign in this sub-account). */
  outboundSms?: "enabled" | "activating" | "registration_required" | null;
  externalId?: string | null;
}

/** `agent.message` (SMS/MMS) data. */
export interface ApMessageData {
  messageId?: string;
  conversationId?: string;
  numberId: string;
  from: string;
  to: string;
  message?: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
  direction?: string;
  receivedAt?: string;
}

/** `agent.message` voice-turn data. */
export interface ApVoiceData {
  callId: string;
  numberId: string;
  from: string;
  to: string;
  status?: string;
  transcript?: string;
  confidence?: number;
  direction?: string;
}

export interface ApCallEndedData {
  callId: string;
  numberId: string;
  from: string;
  to: string;
  direction?: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  summary?: string;
}

export interface ApEvent {
  event: "agent.message" | "agent.call_ended" | "agent.reaction" | "agent.contact_shared" | "number.released" | string;
  channel?: string;
  timestamp?: string;
  agentId?: string;
  test?: boolean;
  data: Record<string, unknown>;
}

/** What a voice webhook returns (one JSON object, or NDJSON chunks). */
export interface ApVoiceReply {
  text?: string;
  hangup?: boolean;
  interim?: boolean;
  send_message?: { body: string };
}

const enc = encodeURIComponent;

export const createAgent = (body: { name: string; description?: string; voiceMode: "webhook"; beginMessage?: string }) => vendorFetch<ApAgent>("agentphone", "POST", "/v1/agents", body);
export const deleteAgent = (agentId: string) => vendorFetch<unknown>("agentphone", "DELETE", `/v1/agents/${enc(agentId)}`);
export const createNumber = (body: { country?: string; areaCode?: string; agentId: string; externalId?: string }) => vendorFetch<ApNumber>("agentphone", "POST", "/v1/numbers", body, { timeoutMs: 45_000 });
export const getVendorNumber = (numberId: string) => vendorFetch<ApNumber>("agentphone", "GET", `/v1/numbers/${enc(numberId)}`);

export interface ApAvailableNumber {
  phoneNumber: string;
  city?: string | null;
  state?: string | null;
  rateCenter?: string | null;
  areaCode?: string | null;
}
/** Live inventory, not reserved. `widened`: the exact area code was out of stock and these are nearby. */
export const availableNumbers = (q: { country?: string; areaCode?: string; limit?: number }) => {
  const qs = new URLSearchParams({ country: q.country ?? "US", limit: String(q.limit ?? 5), ...(q.areaCode ? { areaCode: q.areaCode } : {}) });
  return vendorFetch<{ data: ApAvailableNumber[]; widened?: boolean }>("agentphone", "GET", `/v1/numbers/available?${qs}`);
};

/** AgentPhone's standard rates (USD), shown before a purchase. */
export const PHONE_PRICING = { numberEvery30Days: 3, smsPerSegment: 0.02, voicePerMinute: 0.13, smsRegistrationOneTime: 25 } as const;

/** Irreversible: the number goes back to the carrier. */
export const deleteNumber = (numberId: string) => vendorFetch<unknown>("agentphone", "DELETE", `/v1/numbers/${enc(numberId)}`);
export const sendMessage = (body: { number_id: string; to_number: string; body: string; media_urls?: string[] }) =>
  vendorFetch<{ id: string; status: string; channel?: string; from_number?: string; to_number?: string; conversation_id?: string }>("agentphone", "POST", "/v1/messages", body);

/**
 * AgentPhone signature: `X-Webhook-Signature: sha256=<hex>` = HMAC-SHA256 over `{X-Webhook-Timestamp}.{raw body}`
 * keyed with the webhook secret as given (the whole `whsec_...` string). Timestamps more than 5 minutes off are refused.
 */
export function verifyAgentPhone(rawBody: string, signature: string | null, timestamp: string | null, secret: string, nowSec = Date.now() / 1000): boolean {
  if (!signature || !timestamp || !/^\d{1,12}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
  const got = Buffer.from(signature.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Digits with a leading + (E.164-ish) for comparing numbers. */
export function normalizeNumber(raw: string): string {
  const t = raw.trim();
  const digits = t.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (t.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
