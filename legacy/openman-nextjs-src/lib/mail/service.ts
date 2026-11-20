// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The user's agent email: the personal address (one per user, changeable once every 7 days),
 * workflow addresses (each with a name and a default prompt), and up to 10 approved senders kept both
 * in our table and in AgentMail's inbox-level receive allow list.
 *
 * AgentMail has no aliases or catch-all, so every address is its own inbox. Every inbox of this app lives in one
 * pod (`AGENTMAIL_POD_ID`, else the pod with client_id `openman`), and the app's webhook is scoped to that pod, so
 * nothing here reaches or receives events from other inboxes on the same AgentMail organization. Inboxes carry the
 * owner in `client_id` and `metadata.user_id`; ownership is resolved from our own table by inbox id.
 */
import { consumeUsage, UsageLimitError } from "@/lib/usage";
import { randomBytes } from "node:crypto";
import { brand } from "@/config/brand";
import {
  addSender,
  countOpsSince,
  deleteMailbox,
  getMailbox,
  insertMailbox,
  listMailboxes,
  listSenders,
  recordOp,
  removeSender,
  updateMailbox,
  type AgentMailbox,
} from "@/lib/db/mail";
import { addListEntry, createInbox, createPod, deleteInbox, deleteListEntry } from "./agentmail";
import { VendorError, agentmailDomain, agentmailPodId, vendorConfig } from "./vendor";

export const MAX_SENDERS = 10;
export const ADDRESS_CHANGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60_000;

export class MailError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Workflow address limits by plan: free 3 addresses and 10 create/delete operations a day; paid 30 and 60. */
export function workflowLimits(plan: string): { addresses: number; opsPerDay: number } {
  return /^free$/i.test(plan.trim() || "free") ? { addresses: 3, opsPerDay: 10 } : { addresses: 30, opsPerDay: 60 };
}

const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,38}[a-z0-9])?$/;
const RESERVED = new Set(["admin", "administrator", "postmaster", "abuse", "hostmaster", "webmaster", "support", "security", "noreply", "no-reply", "mailer-daemon", "root", "billing", "help", "info"]);
export const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Our own username rules (AgentMail documents none): 3 to 40 of a-z 0-9 . _ -, starting and ending alphanumeric. */
export function validUsername(raw: string): string {
  const u = raw.trim().toLowerCase().replace(/@.*$/, "");
  if (u.length < 3 || !USERNAME.test(u)) throw new MailError("Use 3 to 40 letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.");
  if (RESERVED.has(u)) throw new MailError("That name is reserved. Pick another.");
  return u;
}

function slug(raw: string): string {
  return (
    raw
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "agent"
  );
}

const suffix = () => randomBytes(4).toString("hex").slice(0, 6);

function friendly(err: unknown): never {
  if (err instanceof VendorError) {
    if (err.code === "resource_taken" || err.status === 409) throw new MailError("That address is taken. Try another.", 409);
    if (err.code === "not_configured") throw new MailError(err.message, 503);
    if (err.code === "limit_exceeded") throw new MailError("Email addresses can't be created right now: the email provider's inbox limit for this server is reached.", 503);
    if (err.status === 400 && /domain/i.test(err.message)) throw new MailError("The email domain is not verified yet.", 503);
    throw new MailError(err.message, 502);
  }
  throw err;
}

const g = globalThis as typeof globalThis & { __omMailPod?: string };

/** The app's one pod. `client_id` makes the create idempotent, so a missing env value finds the same pod again. */
async function podFor(): Promise<string> {
  const configured = agentmailPodId();
  if (configured) return configured;
  const test = !!vendorConfig("agentmail").test; // a test's fake pod is never cached for real use
  if (!test && g.__omMailPod) return g.__omMailPod;
  try {
    const pod = await createPod({ name: "openman", client_id: "openman" });
    if (!test) g.__omMailPod = pod.pod_id;
    return pod.pod_id;
  } catch (err) {
    friendly(err);
  }
}

/** The domain new addresses get: the verified custom domain, or AgentMail's default. */
export const mailDomain = (): string | null => agentmailDomain();

async function newInbox(userId: string, podId: string, username: string, displayName: string, kind: string): Promise<{ inboxId: string; address: string }> {
  try {
    await consumeUsage(userId, "inboxes", 1); // operator-paid: counted before the vendor call
  } catch (err) {
    if (err instanceof UsageLimitError) throw new MailError(err.message, 429);
    throw err;
  }
  try {
    const domain = mailDomain();
    const inbox = await createInbox(podId, {
      username,
      ...(domain ? { domain } : {}),
      display_name: displayName,
      client_id: `om-${userId}-${kind}-${username}`.slice(0, 128),
      metadata: { user_id: userId, kind },
    });
    return { inboxId: inbox.inbox_id, address: inbox.email.toLowerCase() };
  } catch (err) {
    friendly(err);
  }
}

/** Mirrors the approved senders onto one inbox's receive allow list (best effort per entry). */
async function syncAllowList(inboxId: string, senders: string[]): Promise<void> {
  await Promise.all(senders.map((s) => addListEntry(inboxId, "receive", "allow", s).catch((err) => console.warn(`[mail] allow-list add failed for an inbox:`, err instanceof Error ? err.message : err))));
}

export interface MailOverview {
  personal: AgentMailbox | null;
  workflows: AgentMailbox[];
  senders: string[];
  limits: { senders: number; workflows: number; opsPerDay: number; opsToday: number };
  /** When the personal address may next be changed; null when it can be changed now. */
  nextAddressChangeAt: string | null;
  /** The domain new addresses get (`AGENTMAIL_DOMAIN` once verified); null = the provider's default domain. */
  domain: string | null;
}

export async function mailOverview(userId: string, plan: string): Promise<MailOverview> {
  const [boxes, senders, opsToday] = await Promise.all([listMailboxes(userId), listSenders(userId), countOpsSince(userId, new Date(Date.now() - DAY_MS).toISOString())]);
  const personal = boxes.find((b) => b.kind === "personal") ?? null;
  const limits = workflowLimits(plan);
  return {
    personal,
    workflows: boxes.filter((b) => b.kind === "workflow"),
    senders,
    limits: { senders: MAX_SENDERS, workflows: limits.addresses, opsPerDay: limits.opsPerDay, opsToday },
    nextAddressChangeAt: nextChangeAt(personal),
    domain: mailDomain(),
  };
}

function nextChangeAt(personal: AgentMailbox | null): string | null {
  if (!personal?.addressChangedAt) return null;
  const next = new Date(personal.addressChangedAt).getTime() + ADDRESS_CHANGE_DAYS * DAY_MS;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

/** Creates the user's personal address (`name-abc123@domain`) if they have none. Seeds the account email as an approved sender. */
export async function ensurePersonalInbox(userId: string, profile: { name: string; email: string }): Promise<AgentMailbox> {
  const boxes = await listMailboxes(userId);
  const existing = boxes.find((b) => b.kind === "personal");
  if (existing) return existing;
  const podId = await podFor();
  const base = slug(profile.name || profile.email.split("@")[0] || "agent");
  let created: { inboxId: string; address: string } | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    try {
      created = await newInbox(userId, podId, `${base}-${suffix()}`, `${profile.name || "My"} ${brand.agentNoun}`.trim(), "personal");
    } catch (err) {
      if (!(err instanceof MailError && err.status === 409) || attempt === 2) throw err;
    }
  }
  const mailbox = await insertMailbox(userId, { kind: "personal", address: created!.address, displayName: profile.name, inboxId: created!.inboxId, podId });
  const email = profile.email.trim().toLowerCase();
  if (EMAIL.test(email) && !email.endsWith("@localhost")) {
    const senders = await listSenders(userId);
    if (!senders.includes(email) && senders.length < MAX_SENDERS) await addSender(userId, email);
  }
  await syncAllowList(created!.inboxId, await listSenders(userId));
  return mailbox;
}

/**
 * Changes the personal address. AgentMail cannot rename an inbox, so a new inbox is created with the
 * same allow list and the old one is deleted (asynchronously on their side). Once every 7 days.
 */
export async function changePersonalAddress(userId: string, username: string): Promise<AgentMailbox> {
  const u = validUsername(username);
  const boxes = await listMailboxes(userId);
  const personal = boxes.find((b) => b.kind === "personal");
  if (!personal || !personal.inboxId) throw new MailError("Set up your email address first.", 409);
  if (personal.address.split("@")[0] === u) return personal;
  const next = nextChangeAt(personal);
  if (next) throw new MailError(`You can change your address once every ${ADDRESS_CHANGE_DAYS} days. Next change: ${new Date(next).toUTCString()}.`, 429);
  const podId = personal.podId ?? (await podFor());
  const created = await newInbox(userId, podId, u, personal.displayName || brand.agentNoun, "personal");
  await syncAllowList(created.inboxId, await listSenders(userId));
  const oldInbox = personal.inboxId;
  const updated = await updateMailbox(userId, personal.id, { address: created.address, inboxId: created.inboxId, addressChangedAt: new Date().toISOString() });
  await deleteInbox(oldInbox).catch((err) => console.warn("[mail] could not delete the previous inbox:", err instanceof Error ? err.message : err));
  return updated!;
}

async function checkOps(userId: string, plan: string): Promise<void> {
  const { opsPerDay } = workflowLimits(plan);
  const used = await countOpsSince(userId, new Date(Date.now() - DAY_MS).toISOString());
  if (used >= opsPerDay) throw new MailError(`You can create or delete ${opsPerDay} workflow emails a day on your plan. Try again tomorrow.`, 429);
}

export async function createWorkflow(userId: string, plan: string, input: { name: string; username?: string; prompt: string }): Promise<AgentMailbox> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new MailError("Give the workflow email a name.");
  const prompt = input.prompt.trim().slice(0, 4000);
  const boxes = await listMailboxes(userId);
  const limits = workflowLimits(plan);
  if (boxes.filter((b) => b.kind === "workflow").length >= limits.addresses) throw new MailError(`Your plan allows ${limits.addresses} workflow emails.`, 403);
  await checkOps(userId, plan);
  const podId = await podFor();
  const username = input.username?.trim() ? validUsername(input.username) : `${slug(name)}-${suffix()}`;
  const created = await newInbox(userId, podId, username, name, "workflow");
  await syncAllowList(created.inboxId, await listSenders(userId));
  await recordOp(userId, "workflow.create");
  return insertMailbox(userId, { kind: "workflow", address: created.address, name, displayName: name, defaultPrompt: prompt, inboxId: created.inboxId, podId });
}

export async function updateWorkflow(userId: string, id: string, patch: { name?: string; prompt?: string; enabled?: boolean }): Promise<AgentMailbox> {
  const box = await getMailbox(userId, id);
  if (!box || box.kind !== "workflow") throw new MailError("Workflow email not found.", 404);
  const updated = await updateMailbox(userId, id, {
    ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 80) } : {}),
    ...(patch.prompt !== undefined ? { defaultPrompt: patch.prompt.trim().slice(0, 4000) } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
  });
  return updated!;
}

export async function deleteWorkflow(userId: string, plan: string, id: string): Promise<void> {
  const box = await getMailbox(userId, id);
  if (!box || box.kind !== "workflow") throw new MailError("Workflow email not found.", 404);
  await checkOps(userId, plan);
  if (box.inboxId) await deleteInbox(box.inboxId).catch((err) => (err instanceof VendorError && err.status === 404 ? undefined : friendly(err)));
  await deleteMailbox(userId, id);
  await recordOp(userId, "workflow.delete");
}

export async function addApprovedSender(userId: string, raw: string): Promise<string[]> {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new MailError("Enter a valid email address.");
  const senders = await listSenders(userId);
  if (senders.includes(email)) throw new MailError("That address is already approved.", 409);
  if (senders.length >= MAX_SENDERS) throw new MailError(`You can approve up to ${MAX_SENDERS} senders.`, 403);
  await addSender(userId, email);
  const boxes = await listMailboxes(userId);
  await Promise.all(boxes.filter((b) => b.inboxId).map((b) => syncAllowList(b.inboxId!, [email])));
  return listSenders(userId);
}

export async function removeApprovedSender(userId: string, raw: string): Promise<string[]> {
  const email = raw.trim().toLowerCase();
  if (!(await removeSender(userId, email))) throw new MailError("That address is not on the list.", 404);
  const boxes = await listMailboxes(userId);
  await Promise.all(
    boxes
      .filter((b) => b.inboxId)
      .map((b) => deleteListEntry(b.inboxId!, "receive", "allow", email).catch((err) => console.warn("[mail] allow-list delete failed:", err instanceof Error ? err.message : err))),
  );
  return listSenders(userId);
}

/** For the automations engine: a workflow address whose every incoming mail runs `prompt`. */
export async function createTriggerAddress(userId: string, plan: string, input: { name: string; prompt: string }): Promise<{ id: string; address: string }> {
  const box = await createWorkflow(userId, plan, { name: input.name, prompt: input.prompt });
  return { id: box.id, address: box.address };
}
