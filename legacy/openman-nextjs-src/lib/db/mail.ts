// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Agent email data: mailboxes (personal and workflow addresses), approved senders, the mail log,
 * thread-to-task links, the workflow operation counter and webhook de-duplication.
 * Server only. User-facing calls take a `userId`; the webhook lookups by inbox id are the only
 * unscoped reads, and they return the owner so everything after is scoped again.
 */
import { db, fail, iso } from "./client";

export type MailboxKind = "personal" | "workflow";

export interface AgentMailbox {
  id: string;
  userId: string;
  kind: MailboxKind;
  address: string;
  name: string;
  displayName: string;
  defaultPrompt: string;
  /** AgentMail inbox id. */
  inboxId: string | null;
  podId: string | null;
  enabled: boolean;
  addressChangedAt: string | null;
  createdAt: string;
}

interface MailboxRow {
  id: string;
  user_id: string;
  kind: MailboxKind;
  address: string;
  name: string;
  display_name: string;
  default_prompt: string;
  external_id: string | null;
  pod_id: string | null;
  enabled: boolean;
  address_changed_at: string | null;
  created_at: string;
}

const toMailbox = (r: MailboxRow): AgentMailbox => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  address: r.address,
  name: r.name,
  displayName: r.display_name,
  defaultPrompt: r.default_prompt,
  inboxId: r.external_id,
  podId: r.pod_id,
  enabled: r.enabled,
  addressChangedAt: r.address_changed_at ? iso(r.address_changed_at) : null,
  createdAt: iso(r.created_at),
});

export async function listMailboxes(userId: string): Promise<AgentMailbox[]> {
  const { data, error } = await db().from("mailboxes").select("*").eq("user_id", userId).eq("provider", "agentmail").order("created_at", { ascending: true });
  if (error) fail("list mailboxes", error);
  return (data as MailboxRow[]).map(toMailbox);
}

export async function getMailbox(userId: string, id: string): Promise<AgentMailbox | null> {
  const { data, error } = await db().from("mailboxes").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get mailbox", error);
  return data ? toMailbox(data as MailboxRow) : null;
}

/** Webhook routing: the mailbox (and so the owner) for an AgentMail inbox id. */
export async function findMailboxByInbox(inboxId: string): Promise<AgentMailbox | null> {
  const { data, error } = await db().from("mailboxes").select("*").eq("external_id", inboxId).eq("provider", "agentmail").maybeSingle();
  if (error) fail("find mailbox", error);
  return data ? toMailbox(data as MailboxRow) : null;
}

export async function insertMailbox(
  userId: string,
  m: { kind: MailboxKind; address: string; name?: string; displayName?: string; defaultPrompt?: string; inboxId: string; podId: string | null },
): Promise<AgentMailbox> {
  const { data, error } = await db()
    .from("mailboxes")
    .insert({
      user_id: userId,
      provider: "agentmail",
      kind: m.kind,
      address: m.address,
      name: m.name ?? "",
      display_name: m.displayName ?? "",
      default_prompt: m.defaultPrompt ?? "",
      external_id: m.inboxId,
      pod_id: m.podId,
    })
    .select("*")
    .single();
  if (error) fail("create mailbox", error);
  return toMailbox(data as MailboxRow);
}

export async function updateMailbox(
  userId: string,
  id: string,
  patch: Partial<{ address: string; inboxId: string; name: string; defaultPrompt: string; enabled: boolean; addressChangedAt: string }>,
): Promise<AgentMailbox | null> {
  const row: Record<string, unknown> = {};
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.inboxId !== undefined) row.external_id = patch.inboxId;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.defaultPrompt !== undefined) row.default_prompt = patch.defaultPrompt;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.addressChangedAt !== undefined) row.address_changed_at = patch.addressChangedAt;
  const { data, error } = await db().from("mailboxes").update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update mailbox", error);
  return data ? toMailbox(data as MailboxRow) : null;
}

export async function deleteMailbox(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("mailboxes").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete mailbox", error);
  return (data ?? []).length > 0;
}

// ------------------------------------------------------------------ approved senders

export async function listSenders(userId: string): Promise<string[]> {
  const { data, error } = await db().from("mail_senders").select("email").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) fail("list senders", error);
  return (data as { email: string }[]).map((r) => r.email);
}

export async function addSender(userId: string, email: string): Promise<void> {
  const { error } = await db().from("mail_senders").upsert({ user_id: userId, email }, { onConflict: "user_id,email", ignoreDuplicates: true });
  if (error) fail("add sender", error);
}

export async function removeSender(userId: string, email: string): Promise<boolean> {
  const { data, error } = await db().from("mail_senders").delete().eq("user_id", userId).eq("email", email).select("id");
  if (error) fail("remove sender", error);
  return (data ?? []).length > 0;
}

// ------------------------------------------------------------------ mail log

export type MailStatus = "task" | "continued" | "blocked" | "sent" | "failed" | "ignored";

export interface MailRecord {
  id: string;
  mailboxId: string | null;
  direction: "inbound" | "outbound";
  status: MailStatus;
  inboxId: string;
  messageId: string | null;
  threadId: string | null;
  sender: string;
  subject: string;
  preview: string;
  reason: string | null;
  taskId: string | null;
  createdAt: string;
}

interface MailRow {
  id: string;
  mailbox_id: string | null;
  direction: "inbound" | "outbound";
  status: MailStatus;
  inbox_id: string;
  message_id: string | null;
  thread_id: string | null;
  sender: string;
  subject: string;
  preview: string;
  reason: string | null;
  task_id: string | null;
  created_at: string;
}

const toRecord = (r: MailRow): MailRecord => ({
  id: r.id,
  mailboxId: r.mailbox_id,
  direction: r.direction,
  status: r.status,
  inboxId: r.inbox_id,
  messageId: r.message_id,
  threadId: r.thread_id,
  sender: r.sender,
  subject: r.subject,
  preview: r.preview,
  reason: r.reason,
  taskId: r.task_id,
  createdAt: iso(r.created_at),
});

export async function logMail(userId: string, m: Omit<MailRecord, "id" | "createdAt">): Promise<MailRecord> {
  const { data, error } = await db()
    .from("mail_messages")
    .insert({
      user_id: userId,
      mailbox_id: m.mailboxId,
      direction: m.direction,
      status: m.status,
      inbox_id: m.inboxId,
      message_id: m.messageId,
      thread_id: m.threadId,
      sender: m.sender.slice(0, 500),
      subject: m.subject.slice(0, 500),
      preview: m.preview.slice(0, 500),
      reason: m.reason,
      task_id: m.taskId,
    })
    .select("*")
    .single();
  if (error) fail("log mail", error);
  return toRecord(data as MailRow);
}

export async function listMail(userId: string, opts: { status?: MailStatus; limit?: number } = {}): Promise<MailRecord[]> {
  let q = db().from("mail_messages").select("*").eq("user_id", userId);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (error) fail("list mail", error);
  return (data as MailRow[]).map(toRecord);
}

export async function getMail(userId: string, id: string): Promise<MailRecord | null> {
  const { data, error } = await db().from("mail_messages").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get mail", error);
  return data ? toRecord(data as MailRow) : null;
}

export async function setMailStatus(userId: string, id: string, status: MailStatus, reason?: string | null): Promise<void> {
  const { error } = await db().from("mail_messages").update({ status, ...(reason !== undefined ? { reason } : {}) }).eq("user_id", userId).eq("id", id);
  if (error) fail("update mail", error);
}

// ------------------------------------------------------------------ thread <-> task

export interface MailThread {
  id: string;
  inboxId: string;
  threadId: string;
  taskId: string | null;
  lastMessageId: string | null;
  participants: string[];
}

export async function getThread(userId: string, inboxId: string, threadId: string): Promise<MailThread | null> {
  const { data, error } = await db().from("mail_threads").select("*").eq("user_id", userId).eq("inbox_id", inboxId).eq("thread_id", threadId).maybeSingle();
  if (error) fail("get thread", error);
  if (!data) return null;
  const r = data as { id: string; inbox_id: string; thread_id: string; task_id: string | null; last_message_id: string | null; participants: string[] };
  return { id: r.id, inboxId: r.inbox_id, threadId: r.thread_id, taskId: r.task_id, lastMessageId: r.last_message_id, participants: r.participants ?? [] };
}

export async function saveThread(userId: string, t: { inboxId: string; threadId: string; taskId: string; lastMessageId: string | null; participants: string[] }): Promise<void> {
  const { error } = await db()
    .from("mail_threads")
    .upsert(
      { user_id: userId, inbox_id: t.inboxId, thread_id: t.threadId, task_id: t.taskId, last_message_id: t.lastMessageId, participants: t.participants },
      { onConflict: "inbox_id,thread_id" },
    );
  if (error) fail("save thread", error);
}

// ------------------------------------------------------------------ workflow operation counter

export async function countOpsSince(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await db().from("mail_ops").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceIso);
  if (error) fail("count mail ops", error);
  return count ?? 0;
}

export async function recordOp(userId: string, op: string): Promise<void> {
  const { error } = await db().from("mail_ops").insert({ user_id: userId, op });
  if (error) fail("record mail op", error);
}

// ------------------------------------------------------------------ webhook de-duplication

/** Records a delivery. True the first time an event id is seen, false for a repeat. */
export async function claimWebhookEvent(provider: string, eventId: string): Promise<boolean> {
  const { error } = await db().from("webhook_receipts").insert({ provider, event_id: eventId.slice(0, 300) });
  if (!error) return true;
  if (error.code === "23505") return false;
  fail("record webhook", error);
}

/** Lets a delivery be processed again (used when processing could not even start). */
export async function releaseWebhookEvent(provider: string, eventId: string): Promise<void> {
  await db().from("webhook_receipts").delete().eq("provider", provider).eq("event_id", eventId.slice(0, 300));
}
