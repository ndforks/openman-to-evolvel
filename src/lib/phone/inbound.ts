/**
 * Inbound SMS and calls on the agent's number (AgentPhone webhooks, verified and de-duplicated by the route).
 *
 * - SMS from an approved number creates a task, or continues that number's recent task, and the result is
 *   texted back (long results: a short summary and a link to the task). `YES <code>` / `NO <code>` answers a
 *   pending outbound-SMS approval instead.
 * - A call (voice webhook mode, bring-your-own-model): caller ID can be spoofed, so a call never runs anything by
 *   itself. What the caller asks for is texted to that (approved) number with a code; the task starts only when the
 *   owner texts back `YES <code>` from their phone. Later turns of a confirmed call join the same task.
 * - Outbound texts the agent wants to send go through `requestSmsApproval` and wait for the user: an approval card
 *   in the task (`./approvals`), or a `YES <code>` / `NO <code>` text back.
 */
import { brand } from "@/config/brand";
import { randomInt } from "node:crypto";
import { findNumberByVendorId, getCallByVendorId, listSms, logSms, markReleased, pendingForCall, setCallPending, takePendingCall, upsertCall, type AgentNumber } from "@/lib/db/phone";
import { consumeUsage, UsageLimitError } from "@/lib/usage";
import { continueTaskFor, startTaskFor, type RunResult } from "@/lib/mail/runs";
import { appUrl } from "@/lib/mail/vendor";
import { normalizeNumber, type ApCallEndedData, type ApEvent, type ApMessageData, type ApVoiceData, type ApVoiceReply } from "./agentphone";
import { raiseSmsApproval } from "./approvals";
import { decideSms, requestSmsApproval, sendSms } from "./service";

/** A text conversation keeps using the same task for this long after its last message. */
const THREAD_WINDOW_MS = 6 * 60 * 60_000;
const SMS_RESULT_LIMIT = 480;

const PHONE_INSTRUCTIONS =
  `This task came in by phone. Your final answer will be sent by SMS, so keep it short and plain (no Markdown). ` +
  `You cannot text anyone yourself. If the user asked you to text someone, put each message in your final answer as ` +
  `[[sms to="+15551234567"]]message text[[/sms]]; the user will be asked to approve each one before it is sent.`;

const SMS_BLOCK = /\[\[sms to="([^"]+)"\]\]([\s\S]*?)\[\[\/sms\]\]/g;

/** Pulls the outbound-SMS requests out of an answer. */
export function extractSmsRequests(text: string): { clean: string; requests: { to: string; body: string }[] } {
  const requests: { to: string; body: string }[] = [];
  const clean = text
    .replace(SMS_BLOCK, (_, to: string, body: string) => {
      requests.push({ to: to.trim(), body: body.trim() });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { clean, requests };
}

export function smsResult(taskId: string, result: RunResult, approvals: { code: string; to: string; body: string }[]): string {
  const link = `${appUrl()}/app/task/${taskId}`;
  let text = result.ok ? result.text.trim() || "Done." : `I couldn't finish that: ${result.error ?? "unknown error"}`;
  text = text.replace(/[*_`#>]/g, "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)");
  if (text.length > SMS_RESULT_LIMIT || result.files.length) {
    const cut = text.slice(0, 280);
    text = `${text.length > 280 ? `${cut.slice(0, cut.lastIndexOf(" ") > 200 ? cut.lastIndexOf(" ") : 280)}…` : text}\n\nFull result: ${link}`;
  }
  for (const a of approvals) text += `\n\nOK to text ${a.to}: "${a.body.slice(0, 120)}${a.body.length > 120 ? "…" : ""}"? Reply YES ${a.code} or NO ${a.code}.`;
  return text;
}

function allowed(number: AgentNumber, from: string): boolean {
  const f = normalizeNumber(from);
  return number.approvedSenders.some((n) => normalizeNumber(n) === f);
}

async function deliverResult(number: AgentNumber, to: string, taskId: string, result: RunResult): Promise<void> {
  const { clean, requests } = extractSmsRequests(result.text);
  const approvals: { code: string; to: string; body: string }[] = [];
  for (const r of requests.slice(0, 5)) {
    try {
      const pending = await requestSmsApproval(number.userId, { to: r.to, body: r.body, taskId });
      approvals.push({ code: pending.approvalCode!, to: pending.counterpart, body: pending.body });
      // Primary path: an approval card in the task. Texting back YES/NO <code> stays as the second way to answer.
      await raiseSmsApproval(number.userId, pending);
    } catch (err) {
      console.warn("[phone] could not record an SMS approval:", err instanceof Error ? err.message : err);
    }
  }
  await sendSms(number.userId, number, to, smsResult(taskId, { ...result, text: clean }, approvals), taskId);
}

/** The task this caller's texts are going to, when the last one was recent. */
async function recentTaskFor(userId: string, counterpart: string): Promise<string | null> {
  const recent = await listSms(userId, { counterpart, limit: 5 });
  const last = recent.find((r) => r.taskId);
  if (!last || Date.now() - new Date(last.createdAt).getTime() > THREAD_WINDOW_MS) return null;
  return last.taskId;
}

async function handleSms(number: AgentNumber, data: ApMessageData): Promise<void> {
  const userId = number.userId;
  const from = normalizeNumber(data.from);
  const body = (data.message ?? "").trim();
  const media = [...(data.mediaUrls ?? []), ...(data.mediaUrl ? [data.mediaUrl] : [])];
  if (!allowed(number, from)) {
    await logSms(userId, { numberId: number.id, direction: "inbound", counterpart: from, body, status: "blocked", providerMessageId: data.messageId ?? null, error: "Not an approved number." });
    return;
  }
  // YES 1234 / NO 1234 answers a pending approval.
  const answer = body.match(/^(yes|no|y|n)\s+(\d{4})$/i);
  if (answer) {
    const code = answer[2];
    const pending = (await listSms(userId, { status: "awaiting_approval", limit: 50 })).find((s) => s.approvalCode === code);
    await logSms(userId, { numberId: number.id, direction: "inbound", counterpart: from, body, status: "received", taskId: pending?.taskId ?? null, providerMessageId: data.messageId ?? null });
    if (!pending && /^y/i.test(answer[1]) && (await confirmCall(number, from, code))) return;
    if (pending) {
      const decided = await decideSms(userId, pending.id, /^y/i.test(answer[1]) ? "approve" : "deny").catch(() => null);
      const reply = !decided ? "That request was already answered." : decided.status === "sent" ? `Sent to ${decided.counterpart}.` : decided.status === "denied" ? "OK, not sent." : `Couldn't send it: ${decided.error ?? "unknown error"}`;
      await sendSms(userId, number, from, reply, pending.taskId);
      return;
    }
  }
  const text = `${body || "(no text)"}${media.length ? `\n\nAttached media:\n${media.map((u) => `- ${u}`).join("\n")}` : ""}`;
  const existing = await recentTaskFor(userId, from);
  if (existing) {
    const continued = await continueTaskFor(userId, existing, `Text from ${from}:\n${text}`);
    if (continued) {
      await logSms(userId, { numberId: number.id, direction: "inbound", counterpart: from, body, status: "received", taskId: existing, providerMessageId: data.messageId ?? null });
      void continued.done.then((r) => deliverResult(number, from, existing, r));
      return;
    }
  }
  const { taskId, done } = await startTaskFor(userId, { prompt: `${PHONE_INSTRUCTIONS}\n\nText from ${from}:\n${text}`, attachments: media.map((u, i) => ({ name: `media-${i + 1}`, url: u })) });
  await logSms(userId, { numberId: number.id, direction: "inbound", counterpart: from, body, status: "received", taskId, providerMessageId: data.messageId ?? null });
  void done.then((r) => deliverResult(number, from, taskId, r));
}

/** A voice turn: must answer within the voice timeout. Nothing runs until the owner confirms by SMS. */
async function handleVoiceTurn(number: AgentNumber, data: ApVoiceData): Promise<ApVoiceReply> {
  const userId = number.userId;
  const from = normalizeNumber(data.from);
  if (!allowed(number, from)) {
    await upsertCall(userId, { callId: data.callId, numberId: number.id, counterpart: from, direction: data.direction ?? "inbound", status: "blocked" });
    return { text: `Sorry, this ${brand.agentNoun} line only takes calls from its owner. Goodbye.`, hangup: true };
  }
  try {
    await consumeUsage(userId, "call_turns", 1);
  } catch (err) {
    if (err instanceof UsageLimitError) return { text: "This line has reached its call limit for now. Please send a text instead. Goodbye.", hangup: true };
    throw err;
  }
  const said = (data.transcript ?? "").trim();
  if (!said) return { text: "Sorry, I didn't catch that. What would you like me to take on?" };
  const call = await getCallByVendorId(userId, data.callId);
  if (call?.taskId) {
    // Already confirmed by SMS on this call: later turns join that task.
    const continued = await continueTaskFor(userId, call.taskId, `The caller added: ${said}`);
    if (continued) {
      void continued.done.then((r) => deliverResult(number, from, call.taskId!, r));
      return { text: "Got it, I've added that. I'll text you when it's done." };
    }
  }
  const pending = await pendingForCall(userId, data.callId);
  const prompt = pending ? `${pending.prompt}\n${said}` : said;
  const code = pending?.code ?? String(randomInt(1000, 10000));
  await setCallPending(userId, data.callId, prompt, code, { numberId: number.id, counterpart: from, direction: data.direction ?? "inbound" });
  if (!pending) {
    await sendSms(userId, number, from, `Phone request to your ${brand.agentNoun}: "${prompt.slice(0, 200)}${prompt.length > 200 ? "…" : ""}". Reply YES ${code} to run it, or ignore this text.`, null);
  }
  return { text: pending ? "Added. Reply to my text with YES and the code to start." : "I've texted you a code. Reply YES and the code to start, and I'll text you the result." };
}

/** `YES <code>` for a phone request: starts the task the caller described. */
async function confirmCall(number: AgentNumber, from: string, code: string): Promise<boolean> {
  const pending = await takePendingCall(number.userId, code);
  if (!pending) return false;
  const { taskId, done } = await startTaskFor(number.userId, { prompt: `${PHONE_INSTRUCTIONS}\n\nThe user called and said: ${pending.prompt}` });
  await upsertCall(number.userId, { callId: pending.callId, taskId });
  void done.then((r) => deliverResult(number, from, taskId, r));
  await sendSms(number.userId, number, from, "Confirmed. I'm on it and will text you the result.", taskId);
  return true;
}

async function handleCallEnded(number: AgentNumber, data: ApCallEndedData): Promise<void> {
  await upsertCall(number.userId, {
    callId: data.callId,
    numberId: number.id,
    counterpart: normalizeNumber(data.direction === "outbound" ? data.to : data.from),
    direction: data.direction ?? "inbound",
    status: data.status ?? "completed",
    summary: data.summary ?? null,
    durationSeconds: typeof data.durationSeconds === "number" ? Math.round(data.durationSeconds) : null,
    ...(data.startedAt ? { startedAt: data.startedAt } : {}),
    endedAt: data.endedAt ?? new Date().toISOString(),
  });
}

/** Resolves the owner of the number an event is about. */
export async function numberFor(event: ApEvent): Promise<AgentNumber | null> {
  const id = typeof event.data?.numberId === "string" ? event.data.numberId : null;
  if (!id) return null;
  const n = await findNumberByVendorId(id);
  return n && n.status === "active" ? n : null;
}

/** Voice turns are answered synchronously: this returns what the caller hears. */
export async function processVoiceEvent(event: ApEvent): Promise<ApVoiceReply> {
  const number = await numberFor(event);
  if (!number) return { text: "This number is not in service.", hangup: true };
  return handleVoiceTurn(number, event.data as unknown as ApVoiceData);
}

/** Every other event, handled after the webhook has been acknowledged. */
export async function processPhoneEvent(event: ApEvent): Promise<void> {
  const number = await numberFor(event);
  if (!number) {
    console.warn("[phone] event for a number we do not know; ignored");
    return;
  }
  if (event.event === "agent.message" && event.channel !== "voice") return handleSms(number, event.data as unknown as ApMessageData);
  if (event.event === "agent.call_ended") return handleCallEnded(number, event.data as unknown as ApCallEndedData);
  if (event.event === "number.released") return markReleased(number.userId, number.id);
}

