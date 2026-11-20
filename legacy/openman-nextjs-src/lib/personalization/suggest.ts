// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * One cheap model call through the user's agent (Hermes' stateless `/v1/chat/completions`, Haiku via
 * Orgo's proxy) that turns text into proposed knowledge entries. Used for "suggested knowledge" after a
 * task and for importing memory from another assistant. Nothing is saved here; the user accepts entries.
 * Server only.
 */
import { hermesTarget, primeConnection } from "@/lib/agent/server/connection";
import type { Session } from "@/lib/session";

export interface ProposedEntry {
  name: string;
  whenToUse: string;
  content: string;
}

export interface ProposedProfile {
  nickname?: string;
  occupation?: string;
  about?: string;
  instructions?: string;
}

export class SuggestError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const CHEAP_MODEL = "claude-haiku-5-5";

async function complete(session: Session, system: string, user: string, timeoutMs = 90_000): Promise<string> {
  await primeConnection(session);
  const target = hermesTarget(session.userId);
  if (target.kind !== "hermes") throw new SuggestError(target.kind === "missing" ? target.reason : "No agent is connected, so nothing can be proposed.", 409);
  const { cfg } = target;
  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({
      provider: "anthropic",
      model: CHEAP_MODEL,
      model_options: { reasoning_effort: "low" },
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new SuggestError(`The agent could not be reached: ${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) throw new SuggestError(`The agent answered ${res.status}.`);
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : "")).join("");
  throw new SuggestError("The agent sent an empty answer.");
}

/** The first JSON object in a model answer (tolerates code fences and prose around it). */
function firstJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function entriesFrom(raw: unknown, max: number): ProposedEntry[] {
  const list = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => ({ name: str((e as Record<string, unknown>)?.name, 200), whenToUse: str((e as Record<string, unknown>)?.whenToUse, 2000), content: str((e as Record<string, unknown>)?.content, 20_000) }))
    .filter((e) => e.name && e.content)
    .slice(0, max);
}

const ENTRY_SHAPE = `{"entries":[{"name":"short title","whenToUse":"the situation in which this applies","content":"the instruction or fact, written as guidance for an assistant"}]}`;

/** Zero to two knowledge entries worth keeping from a finished task. */
export async function suggestFromTask(session: Session, transcript: string, existingNames: string[]): Promise<ProposedEntry[]> {
  const system =
    "You review a finished task between a user and an AI agent and propose at most two reusable knowledge entries: durable user preferences or task-specific best practices the user stated or corrected, that would help in future tasks. " +
    "Do not propose facts about this one task, things the agent did on its own, or anything already in the existing list. Most tasks deserve zero entries. " +
    `Reply with JSON only, exactly this shape: ${ENTRY_SHAPE}. Reply {"entries":[]} when nothing qualifies. Do not use any tools.`;
  const user = `Existing knowledge names: ${existingNames.length ? existingNames.join("; ") : "(none)"}\n\nTask transcript:\n${transcript}`;
  return entriesFrom(firstJson(await complete(session, system, user)), 2);
}

/** Entries (and profile fields) from a transfer document pasted from another assistant. */
export async function proposeFromImport(session: Session, doc: string, existingNames: string[], max: number): Promise<{ entries: ProposedEntry[]; profile: ProposedProfile }> {
  const system =
    "The user pasted a transfer document another AI assistant produced about them (stored memory, custom instructions, preferences). Turn it into: " +
    "(1) profile fields: nickname (what to call them), occupation, about (a short paragraph of durable facts about them), instructions (how they want responses written); leave a field out if the document does not say; " +
    `(2) up to ${max} knowledge entries for specific, reusable preferences or practices, each with a trigger condition. Skip anything already in the existing list, secrets, passwords and one-off details. ` +
    `Reply with JSON only: {"profile":{"nickname":"","occupation":"","about":"","instructions":""},"entries":[{"name":"","whenToUse":"","content":""}]}. Do not use any tools.`;
  const user = `Existing knowledge names: ${existingNames.length ? existingNames.join("; ") : "(none)"}\n\nTransfer document:\n${doc}`;
  const raw = firstJson(await complete(session, system, user, 120_000));
  const p = ((raw as { profile?: Record<string, unknown> } | null)?.profile ?? {}) as Record<string, unknown>;
  const profile: ProposedProfile = {};
  const nickname = str(p.nickname, 50);
  const occupation = str(p.occupation, 100);
  const about = str(p.about, 2000);
  const instructions = str(p.instructions, 3000);
  if (nickname) profile.nickname = nickname;
  if (occupation) profile.occupation = occupation;
  if (about) profile.about = about;
  if (instructions) profile.instructions = instructions;
  return { entries: entriesFrom(raw, max), profile };
}
