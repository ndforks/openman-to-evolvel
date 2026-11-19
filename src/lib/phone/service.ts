/**
 * The agent's phone number: provision (one AgentPhone agent in webhook voice mode plus one number per user),
 * release, approved callers, and outbound SMS that only goes out after an explicit approval.
 */
import { randomInt } from "node:crypto";
import { brand } from "@/config/brand";
import { getNumber, getSms, insertNumber, listNumbers, listSms, logSms, markReleased, updateNumber, updateSms, type AgentNumber, type SmsRecord } from "@/lib/db/phone";
import { VendorError } from "@/lib/mail/vendor";
import { consumeUsage, UsageLimitError } from "@/lib/usage";
import { settleSmsApproval } from "./approvals";
import { createAgent, createNumber, deleteAgent, deleteNumber, getVendorNumber, normalizeNumber, sendMessage } from "./agentphone";

export class PhoneError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const MAX_APPROVED_CALLERS = 10;
const SMS_LIMIT = 1600;

function friendly(err: unknown): never {
  if (err instanceof VendorError) {
    if (err.code === "not_configured") throw new PhoneError(err.message, 503);
    if (err.status === 402) throw new PhoneError("The phone provider needs a payment method or more balance before it can buy a number.", 402);
    if (err.status === 409) throw new PhoneError("No number was available there. Try another area code.", 409);
    if (err.status === 429) throw new PhoneError("The phone provider is busy. Try again in a minute.", 429);
    throw new PhoneError(err.message, 502);
  }
  throw err;
}

/** Buys a number for the user. One active number per user. */
export async function provisionNumber(userId: string, profile: { name: string }, opts: { country?: "US" | "CA"; areaCode?: string; approvedCallers?: string[] }): Promise<AgentNumber> {
  const existing = await listNumbers(userId);
  if (existing.length > 0) throw new PhoneError("You already have a number.", 409);
  const areaCode = opts.areaCode?.trim();
  if (areaCode && !/^\d{3}$/.test(areaCode)) throw new PhoneError("An area code is three digits.");
  const callers = (opts.approvedCallers ?? []).map(normalizeNumber).filter((n) => n.length >= 8).slice(0, MAX_APPROVED_CALLERS);
  // Numbers are paid by the operator: counted (daily and monthly) before anything is bought. A unique index keeps
  // one active number per user even when requests race past the check above.
  try {
    await consumeUsage(userId, "phone_numbers", 1);
  } catch (err) {
    if (err instanceof UsageLimitError) throw new PhoneError(err.message, 429);
    throw err;
  }
  let agentId: string | null = null;
  let boughtId: string | null = null;
  try {
    const agent = await createAgent({
      name: `${profile.name || "User"}'s ${brand.agentNoun}`.slice(0, 100),
      description: `user:${userId}`,
      voiceMode: "webhook",
      beginMessage: `Hi, this is ${brand.agentNoun}. What should I work on?`,
    });
    agentId = agent.id;
    const num = await createNumber({ country: opts.country ?? "US", ...(areaCode ? { areaCode } : {}), agentId, externalId: `om-${userId}` });
    boughtId = num.id;
    return await insertNumber(userId, { number: num.phoneNumber, numberId: num.id, agentId, outboundSms: num.outboundSms ?? null, approvedSenders: callers });
  } catch (err) {
    if (boughtId) await deleteNumber(boughtId).catch(() => undefined); // e.g. a parallel request won the one-number slot
    if (agentId) await deleteAgent(agentId).catch(() => undefined);
    if (err && typeof err === "object" && (err as { code?: string }).code === "23505") throw new PhoneError("You already have a number.", 409);
    friendly(err);
  }
}

/** Re-reads `outboundSms` from AgentPhone for numbers that cannot send yet (campaign attachment happens after purchase). */
export async function refreshSmsReadiness(userId: string, numbers: AgentNumber[]): Promise<AgentNumber[]> {
  return Promise.all(
    numbers.map(async (n) => {
      if (n.status !== "active" || !n.numberId || n.outboundSms === "enabled") return n;
      try {
        const v = await getVendorNumber(n.numberId);
        if (v.outboundSms && v.outboundSms !== n.outboundSms) return (await updateNumber(userId, n.id, { outboundSms: v.outboundSms })) ?? n;
      } catch (err) {
        console.warn("[phone] could not refresh SMS readiness:", err instanceof Error ? err.message : err);
      }
      return n;
    }),
  );
}

/** Releases the number back to the carrier and removes its agent. History is kept. */
export async function releaseNumber(userId: string, id: string): Promise<void> {
  const n = await getNumber(userId, id);
  if (!n || n.status !== "active") throw new PhoneError("Number not found.", 404);
  if (n.numberId) await deleteNumber(n.numberId).catch((err) => (err instanceof VendorError && err.status === 404 ? undefined : friendly(err)));
  if (n.agentId) await deleteAgent(n.agentId).catch(() => undefined);
  await markReleased(userId, id);
}

export async function setApprovedCallers(userId: string, id: string, raw: string[]): Promise<AgentNumber> {
  const callers = [...new Set(raw.map(normalizeNumber).filter((n) => n.length >= 8))];
  if (callers.length > MAX_APPROVED_CALLERS) throw new PhoneError(`Up to ${MAX_APPROVED_CALLERS} numbers.`);
  const updated = await updateNumber(userId, id, { approvedSenders: callers });
  if (!updated) throw new PhoneError("Number not found.", 404);
  return updated;
}

/** Sends one SMS from the user's number and records it. Callers are responsible for approval. */
export async function sendSms(userId: string, number: AgentNumber, to: string, body: string, taskId: string | null, existingId?: string): Promise<SmsRecord> {
  const text = body.length > SMS_LIMIT ? `${body.slice(0, SMS_LIMIT - 1)}…` : body;
  try {
    await consumeUsage(userId, "sms", Math.max(1, Math.ceil(text.length / 160)));
    const sent = await sendMessage({ number_id: number.numberId!, to_number: normalizeNumber(to), body: text });
    if (existingId) return (await updateSms(userId, existingId, { status: "sent", providerMessageId: sent.id }))!;
    return await logSms(userId, { numberId: number.id, direction: "outbound", counterpart: normalizeNumber(to), body: text, status: "sent", taskId, providerMessageId: sent.id });
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 500) : String(err);
    if (existingId) return (await updateSms(userId, existingId, { status: "failed", error }))!;
    return logSms(userId, { numberId: number.id, direction: "outbound", counterpart: normalizeNumber(to), body: text, status: "failed", taskId, error });
  }
}

/**
 * Asks for permission to send an SMS on the agent's behalf. Nothing is sent until the user approves it,
 * in Settings -> Phone or by texting back `YES <code>`. Recorded against the task.
 */
export async function requestSmsApproval(userId: string, input: { to: string; body: string; taskId: string | null }): Promise<SmsRecord> {
  const [number] = await listNumbers(userId);
  if (!number) throw new PhoneError("No phone number is set up.", 409);
  const to = normalizeNumber(input.to);
  if (to.length < 8) throw new PhoneError("That is not a phone number.");
  const body = input.body.trim();
  if (!body) throw new PhoneError("The message is empty.");
  return logSms(userId, { numberId: number.id, direction: "outbound", counterpart: to, body: body.slice(0, SMS_LIMIT), status: "awaiting_approval", taskId: input.taskId, approvalCode: String(randomInt(1000, 10000)) });
}

export async function listPendingApprovals(userId: string, taskId?: string): Promise<SmsRecord[]> {
  return listSms(userId, { status: "awaiting_approval", taskId });
}

/** Approve (sends it) or deny a pending outbound SMS. */
export async function decideSms(userId: string, id: string, decision: "approve" | "deny"): Promise<SmsRecord> {
  const sms = await getSms(userId, id);
  if (!sms || sms.status !== "awaiting_approval") throw new PhoneError("This request is no longer waiting for an answer.", 409);
  if (decision === "deny") {
    const denied = (await updateSms(userId, id, { status: "denied" }))!;
    await settleSmsApproval(userId, sms.taskId, id, "deny");
    return denied;
  }
  const [number] = await listNumbers(userId);
  if (!number) throw new PhoneError("No phone number is set up.", 409);
  await updateSms(userId, id, { status: "approved" });
  const sent = await sendSms(userId, number, sms.counterpart, sms.body, sms.taskId, id);
  await settleSmsApproval(userId, sms.taskId, id, "approve");
  return sent;
}
