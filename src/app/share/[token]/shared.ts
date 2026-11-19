// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Builds the public, read-only view of a shared task from its stored events. Server-only. */
import type { AgentEvent } from "@/lib/agent/types";
import { resolveShareToken } from "@/lib/db/shares";
import { getTaskRow, listTaskEvents } from "@/lib/db/tasks";

export type SharedItem =
  | { kind: "user"; text: string; at: string }
  | { kind: "assistant"; text: string; at: string }
  | { kind: "tool"; tool: string; preview: string; error: boolean; at: string }
  | { kind: "file"; fileId: string; name: string; mime?: string; size?: number; at: string }
  | { kind: "plan"; steps: { title: string; status: string }[]; at: string }
  | { kind: "end"; status: "completed" | "failed" | "stopped"; text?: string; at: string };

export interface SharedTask {
  token: string;
  title: string;
  createdAt: string;
  items: SharedItem[];
}

const PATTERNS: RegExp[] = [
  /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{12,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+(@)/gi,
];
/** `key: value` / `key=value` where the key names a secret. */
const NAMED = /\b([A-Za-z0-9_-]*(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|private[_-]?key|client[_-]?secret|auth)[A-Za-z0-9_-]*)(["']?\s*[:=]\s*["']?)([^\s"',;&]{4,})/gi;
const QUERY = /([?&](?:token|key|apikey|api_key|access_token|password|secret|sig|signature)=)[^&\s"']+/gi;

/** Replaces anything that looks like a credential with a marker. */
export function redact(text: string): string {
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, (match, a?: string, b?: string) => (typeof a === "string" && typeof b === "string" && match.includes("://") ? `${a}[redacted]${b}` : "[redacted]"));
  }
  out = out.replace(QUERY, "$1[redacted]");
  out = out.replace(NAMED, (_m, key: string, sep: string) => `${key}${sep}[redacted]`);
  return out;
}

/** Turns the event log into the items the page shows, in order. Deltas are folded into whole messages. */
export function toItems(events: AgentEvent[]): SharedItem[] {
  const items: SharedItem[] = [];
  let pending = "";
  let pendingAt = "";
  const flush = () => {
    if (pending.trim()) items.push({ kind: "assistant", text: redact(pending), at: pendingAt });
    pending = "";
  };
  for (const e of events) {
    switch (e.type) {
      case "message.delta":
        if (!pending) pendingAt = e.at;
        pending += e.text;
        break;
      case "message.completed":
        pending = "";
        if (e.text.trim()) items.push({ kind: "assistant", text: redact(e.text), at: e.at });
        break;
      case "user.message":
        flush();
        items.push({ kind: "user", text: redact(e.text), at: e.at });
        break;
      case "tool.completed":
        flush();
        items.push({ kind: "tool", tool: e.tool, preview: redact(e.preview ?? "").slice(0, 400), error: !!e.error, at: e.at });
        break;
      case "file.created":
        items.push({ kind: "file", fileId: e.fileId, name: e.name, mime: e.mime, size: e.size, at: e.at });
        break;
      case "plan.updated":
        items.push({ kind: "plan", steps: e.steps.map((s) => ({ title: redact(s.title), status: s.status })), at: e.at });
        break;
      case "run.completed":
        flush();
        items.push({ kind: "end", status: "completed", at: e.at });
        break;
      case "run.failed":
        flush();
        items.push({ kind: "end", status: "failed", text: redact(e.error), at: e.at });
        break;
      case "status":
        if (e.status === "stopped") {
          flush();
          items.push({ kind: "end", status: "stopped", at: e.at });
        }
        break;
      default:
        break;
    }
  }
  flush();
  return items;
}

/** The shared task for a public token, or null when the token is unknown, revoked or private. */
export async function loadShared(token: string): Promise<(SharedTask & { userId: string; taskId: string }) | null> {
  const share = await resolveShareToken(token);
  if (!share) return null;
  const task = await getTaskRow(share.userId, share.taskId);
  if (!task) return null;
  const events = await listTaskEvents(share.userId, share.taskId);
  return { token, title: redact(task.title), createdAt: task.createdAt, items: toItems(events), userId: share.userId, taskId: share.taskId };
}
