/** Inbound event triggers: webhooks (`/api/hooks/[token]`) and email (called by the mail area). */
import { getAccount } from "@/lib/db/accounts";
import { timingSafeEqual } from "node:crypto";
import { open } from "@/lib/crypto";
import { automationByHookToken, automationsWithEmailTriggers } from "@/lib/db/automations";
import { allConditionsHold } from "./conditions";
import { fireAutomation } from "./engine";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Small in-memory rate limit per token: 30 calls a minute.
const g = globalThis as typeof globalThis & { __omHookHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__omHookHits ??= new Map());
function limited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  return list.length > 30;
}

export type HookResult = { status: number; body: Record<string, unknown> };

export async function handleWebhook(tokenValue: string, headers: Headers, body: unknown, query: Record<string, string>): Promise<HookResult> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(tokenValue)) return { status: 404, body: { error: "Unknown webhook." } };
  if (limited(tokenValue)) return { status: 429, body: { error: "Too many calls. Try again in a minute." } };
  const a = await automationByHookToken(tokenValue);
  const trigger = a?.triggers.find((t) => t.type === "webhook");
  if (!a || !trigger || trigger.type !== "webhook") return { status: 404, body: { error: "Unknown webhook." } };
  if (trigger.authHeaderName && trigger.authHeaderValueEnc) {
    const got = headers.get(trigger.authHeaderName) ?? "";
    let want = "";
    try {
      want = open(trigger.authHeaderValueEnc);
    } catch {
      return { status: 500, body: { error: "This webhook's auth header can't be read. Set it again." } };
    }
    if (!got || !same(got, want)) return { status: 401, body: { error: "Missing or wrong auth header." } };
  }
  if (!a.enabled) return { status: 409, body: { error: "This automation is paused." } };
  if (a.endsAt && Date.parse(a.endsAt) < Date.now()) return { status: 410, body: { error: "This automation has ended." } };
  const event = { body, query, headers: { "content-type": headers.get("content-type") ?? undefined, "user-agent": headers.get("user-agent") ?? undefined } };
  if (!allConditionsHold(trigger.conditions, body)) return { status: 202, body: { ok: true, skipped: true, reason: "The event did not match the trigger's conditions." } };
  const run = await fireAutomation(a, { trigger: "webhook", event });
  return { status: 202, body: { ok: true, runId: run?.id ?? null, taskId: run?.taskId ?? null, status: run?.status ?? null } };
}

export interface InboundEmail {
  /** Every recipient address of the message (To and Cc). */
  to: string[];
  from: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string;
  attachments?: { name: string; url?: string; mime?: string; size?: number }[];
}

const ownerCache = new Map<string, string[]>();
async function ownerEmails(userId: string): Promise<string[]> {
  if (!ownerCache.has(userId)) {
    const email = (await getAccount(userId).catch(() => null))?.email?.trim().toLowerCase();
    ownerCache.set(userId, email ? [email] : []);
  }
  return ownerCache.get(userId)!;
}

const bare = (addr: string) => (addr.match(/<([^>]+)>/)?.[1] ?? addr).trim().toLowerCase();

/**
 * For the mail area: call this for every inbound message. Any automation whose email trigger
 * address is a recipient, whose approved senders include the sender and whose conditions hold, gets a run.
 * A trigger with no sender list accepts only the owner's own (Orgo account) email address, so mail that merely
 * CCs someone's trigger address cannot fire it. Returns the runs started.
 */
export async function handleInboundEmail(mail: InboundEmail): Promise<{ matched: number; runIds: string[] }> {
  const recipients = new Set(mail.to.map(bare));
  if (![...recipients].some((r) => r.startsWith("auto-"))) return { matched: 0, runIds: [] };
  const from = bare(mail.from);
  const runIds: string[] = [];
  let matched = 0;
  for (const a of await automationsWithEmailTriggers()) {
    for (const t of a.triggers) {
      if (t.type !== "email" || !recipients.has(t.address.toLowerCase())) continue;
      const senders = t.senders.length ? t.senders : await ownerEmails(a.userId);
      if (!senders.some((s) => s === from || (s.startsWith("@") && from.endsWith(s)))) continue;
      const event = { from, subject: mail.subject, text: mail.text.slice(0, 20_000), messageId: mail.messageId, attachments: mail.attachments ?? [] };
      if (!allConditionsHold(t.conditions, event)) continue;
      matched++;
      const run = await fireAutomation(a, { trigger: "email", event });
      if (run) runIds.push(run.id);
    }
  }
  return { matched, runIds };
}
