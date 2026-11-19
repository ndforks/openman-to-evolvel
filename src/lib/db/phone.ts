/**
 * Agent phone data: numbers, SMS records (including outbound sends waiting for approval) and calls.
 * Server only. Webhook lookups by vendor number id return the owner; everything after is scoped by it.
 */
import { db, fail, iso } from "./client";

export interface AgentNumber {
  id: string;
  userId: string;
  number: string;
  label: string;
  /** AgentPhone number id (`num_...`). */
  numberId: string | null;
  /** AgentPhone agent id (`agt_...`). */
  agentId: string | null;
  status: "active" | "released";
  outboundSms: string | null;
  approvedSenders: string[];
  enabled: boolean;
  releasedAt: string | null;
  createdAt: string;
}

interface NumberRow {
  id: string;
  user_id: string;
  number: string;
  label: string;
  external_id: string | null;
  agent_id: string | null;
  status: "active" | "released";
  outbound_sms: string | null;
  approved_senders: string[] | null;
  enabled: boolean;
  released_at: string | null;
  created_at: string;
}

const toNumber = (r: NumberRow): AgentNumber => ({
  id: r.id,
  userId: r.user_id,
  number: r.number,
  label: r.label,
  numberId: r.external_id,
  agentId: r.agent_id,
  status: r.status,
  outboundSms: r.outbound_sms,
  approvedSenders: r.approved_senders ?? [],
  enabled: r.enabled,
  releasedAt: r.released_at ? iso(r.released_at) : null,
  createdAt: iso(r.created_at),
});

export async function listNumbers(userId: string, opts: { includeReleased?: boolean } = {}): Promise<AgentNumber[]> {
  let q = db().from("phone_numbers").select("*").eq("user_id", userId).eq("provider", "agentphone");
  if (!opts.includeReleased) q = q.eq("status", "active");
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) fail("list numbers", error);
  return (data as NumberRow[]).map(toNumber);
}

export async function getNumber(userId: string, id: string): Promise<AgentNumber | null> {
  const { data, error } = await db().from("phone_numbers").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get number", error);
  return data ? toNumber(data as NumberRow) : null;
}

/** Webhook routing: the active number (and so the owner) for an AgentPhone number id. */
export async function findNumberByVendorId(numberId: string): Promise<AgentNumber | null> {
  const { data, error } = await db().from("phone_numbers").select("*").eq("external_id", numberId).eq("provider", "agentphone").maybeSingle();
  if (error) fail("find number", error);
  return data ? toNumber(data as NumberRow) : null;
}

export async function insertNumber(
  userId: string,
  n: { number: string; numberId: string; agentId: string; label?: string; outboundSms?: string | null; approvedSenders?: string[] },
): Promise<AgentNumber> {
  const { data, error } = await db()
    .from("phone_numbers")
    .insert({
      user_id: userId,
      provider: "agentphone",
      number: n.number,
      external_id: n.numberId,
      agent_id: n.agentId,
      label: n.label ?? "",
      outbound_sms: n.outboundSms ?? null,
      approved_senders: n.approvedSenders ?? [],
    })
    .select("*")
    .single();
  if (error) fail("save number", error);
  return toNumber(data as NumberRow);
}

export async function updateNumber(
  userId: string,
  id: string,
  patch: Partial<{ approvedSenders: string[]; enabled: boolean; status: "active" | "released"; releasedAt: string; outboundSms: string; label: string }>,
): Promise<AgentNumber | null> {
  const row: Record<string, unknown> = {};
  if (patch.approvedSenders !== undefined) row.approved_senders = patch.approvedSenders;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.releasedAt !== undefined) row.released_at = patch.releasedAt;
  if (patch.outboundSms !== undefined) row.outbound_sms = patch.outboundSms;
  if (patch.label !== undefined) row.label = patch.label;
  const { data, error } = await db().from("phone_numbers").update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update number", error);
  return data ? toNumber(data as NumberRow) : null;
}

/**
 * A released number keeps its row for history, but gives up the unique phone number and vendor id,
 * so the same number can be bought again later.
 */
export async function markReleased(userId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await db().from("phone_numbers").select("number, external_id").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("release number", error);
  if (!data) return;
  const r = data as { number: string; external_id: string | null };
  const { error: e2 } = await db()
    .from("phone_numbers")
    .update({ status: "released", released_at: now, enabled: false, number: `${r.number}#released-${Date.now()}`, external_id: r.external_id ? `${r.external_id}#released-${Date.now()}` : null, label: r.number })
    .eq("user_id", userId)
    .eq("id", id);
  if (e2) fail("release number", e2);
}

// ------------------------------------------------------------------ SMS records

export type SmsStatus = "received" | "blocked" | "awaiting_approval" | "approved" | "denied" | "sent" | "failed";

export interface SmsRecord {
  id: string;
  numberId: string | null;
  direction: "inbound" | "outbound";
  counterpart: string;
  body: string;
  status: SmsStatus;
  taskId: string | null;
  providerMessageId: string | null;
  approvalCode: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SmsRow {
  id: string;
  number_id: string | null;
  direction: "inbound" | "outbound";
  counterpart: string;
  body: string;
  status: SmsStatus;
  task_id: string | null;
  provider_message_id: string | null;
  approval_code: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const toSms = (r: SmsRow): SmsRecord => ({
  id: r.id,
  numberId: r.number_id,
  direction: r.direction,
  counterpart: r.counterpart,
  body: r.body,
  status: r.status,
  taskId: r.task_id,
  providerMessageId: r.provider_message_id,
  approvalCode: r.approval_code,
  error: r.error,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function logSms(userId: string, m: Partial<Omit<SmsRecord, "id" | "createdAt" | "updatedAt">> & Pick<SmsRecord, "direction" | "counterpart" | "status">): Promise<SmsRecord> {
  const { data, error } = await db()
    .from("phone_messages")
    .insert({
      user_id: userId,
      number_id: m.numberId ?? null,
      direction: m.direction,
      counterpart: m.counterpart,
      body: (m.body ?? "").slice(0, 5000),
      status: m.status,
      task_id: m.taskId ?? null,
      provider_message_id: m.providerMessageId ?? null,
      approval_code: m.approvalCode ?? null,
      error: m.error ?? null,
    })
    .select("*")
    .single();
  if (error) fail("log sms", error);
  return toSms(data as SmsRow);
}

export async function updateSms(userId: string, id: string, patch: Partial<Pick<SmsRecord, "status" | "providerMessageId" | "error" | "taskId">>): Promise<SmsRecord | null> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.providerMessageId !== undefined) row.provider_message_id = patch.providerMessageId;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.taskId !== undefined) row.task_id = patch.taskId;
  const { data, error } = await db().from("phone_messages").update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update sms", error);
  return data ? toSms(data as SmsRow) : null;
}

export async function getSms(userId: string, id: string): Promise<SmsRecord | null> {
  const { data, error } = await db().from("phone_messages").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get sms", error);
  return data ? toSms(data as SmsRow) : null;
}

export async function listSms(userId: string, opts: { status?: SmsStatus; taskId?: string; counterpart?: string; limit?: number } = {}): Promise<SmsRecord[]> {
  let q = db().from("phone_messages").select("*").eq("user_id", userId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.taskId) q = q.eq("task_id", opts.taskId);
  if (opts.counterpart) q = q.eq("counterpart", opts.counterpart);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (error) fail("list sms", error);
  return (data as SmsRow[]).map(toSms);
}

// ------------------------------------------------------------------ calls

export interface CallRecord {
  id: string;
  numberId: string | null;
  callId: string;
  counterpart: string;
  direction: string;
  status: string;
  taskId: string | null;
  summary: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
}

interface CallRow {
  id: string;
  number_id: string | null;
  call_id: string;
  counterpart: string;
  direction: string;
  status: string;
  task_id: string | null;
  summary: string | null;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
}

const toCall = (r: CallRow): CallRecord => ({
  id: r.id,
  numberId: r.number_id,
  callId: r.call_id,
  counterpart: r.counterpart,
  direction: r.direction,
  status: r.status,
  taskId: r.task_id,
  summary: r.summary,
  durationSeconds: r.duration_seconds,
  startedAt: iso(r.started_at),
  endedAt: r.ended_at ? iso(r.ended_at) : null,
});

export async function getCallByVendorId(userId: string, callId: string): Promise<CallRecord | null> {
  const { data, error } = await db().from("phone_calls").select("*").eq("user_id", userId).eq("call_id", callId).maybeSingle();
  if (error) fail("get call", error);
  return data ? toCall(data as CallRow) : null;
}

export async function upsertCall(userId: string, c: Partial<Omit<CallRecord, "id">> & { callId: string }): Promise<CallRecord> {
  const row: Record<string, unknown> = { user_id: userId, call_id: c.callId };
  if (c.numberId !== undefined) row.number_id = c.numberId;
  if (c.counterpart !== undefined) row.counterpart = c.counterpart;
  if (c.direction !== undefined) row.direction = c.direction;
  if (c.status !== undefined) row.status = c.status;
  if (c.taskId !== undefined) row.task_id = c.taskId;
  if (c.summary !== undefined) row.summary = c.summary;
  if (c.durationSeconds !== undefined) row.duration_seconds = c.durationSeconds;
  if (c.startedAt !== undefined) row.started_at = c.startedAt;
  if (c.endedAt !== undefined) row.ended_at = c.endedAt;
  const { data, error } = await db().from("phone_calls").upsert(row, { onConflict: "call_id" }).select("*").single();
  if (error) fail("save call", error);
  return toCall(data as CallRow);
}

export async function listCalls(userId: string, limit = 100): Promise<CallRecord[]> {
  const { data, error } = await db().from("phone_calls").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(limit);
  if (error) fail("list calls", error);
  return (data as CallRow[]).map(toCall);
}

/* ---------------------------------------------------------------- calls waiting for an SMS confirmation */

/** Records (or extends) what a caller asked for on a call, with the code the owner must text back to run it. */
export async function setCallPending(userId: string, callId: string, prompt: string, code: string, extra: { numberId: string; counterpart: string; direction: string }): Promise<void> {
  const { error } = await db()
    .from("phone_calls")
    .upsert({ user_id: userId, call_id: callId, number_id: extra.numberId, counterpart: extra.counterpart, direction: extra.direction, pending_prompt: prompt.slice(0, 4000), confirm_code: code }, { onConflict: "call_id" });
  if (error) fail("save pending call", error);
}

/** The call waiting for `code` (texted back by the owner), cleared so it runs once. */
export async function takePendingCall(userId: string, code: string): Promise<{ callId: string; prompt: string } | null> {
  const { data, error } = await db()
    .from("phone_calls")
    .update({ confirm_code: null })
    .eq("user_id", userId)
    .eq("confirm_code", code)
    .gte("started_at", new Date(Date.now() - 2 * 3600_000).toISOString())
    .select("call_id,pending_prompt");
  if (error) fail("take pending call", error);
  const row = (data as { call_id: string; pending_prompt: string | null }[] | null)?.[0];
  return row?.pending_prompt ? { callId: row.call_id, prompt: row.pending_prompt } : null;
}

/** What is already waiting on this call, if anything. */
export async function pendingForCall(userId: string, callId: string): Promise<{ prompt: string; code: string } | null> {
  const { data, error } = await db().from("phone_calls").select("pending_prompt,confirm_code").eq("user_id", userId).eq("call_id", callId).maybeSingle();
  if (error) fail("read pending call", error);
  const r = data as { pending_prompt: string | null; confirm_code: string | null } | null;
  return r?.pending_prompt && r.confirm_code ? { prompt: r.pending_prompt, code: r.confirm_code } : null;
}
