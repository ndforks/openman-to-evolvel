// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Task fields this area keeps in `tasks.meta` next to the store's own (`TaskMeta`): how the agent works on the task,
 * where it came from, what it refers to. Stored as part of the same JSON document, so no schema change is needed.
 */
import type { AgentEvent, ChildKind, Interaction, TaskReference } from "@/lib/agent/types";
import type { TaskMeta, TaskRecord } from "@/lib/store/types";

export interface ExtMeta extends TaskMeta {
  /** Agent (default), Chat or Plan. Chat and Plan run in the `om-chat` Hermes profile. */
  interaction?: Interaction;
  /** Set on a parallel task or a side chat: the task it belongs to. */
  parentTaskId?: string;
  childKind?: ChildKind;
  /** Earlier tasks the user referenced in this task's messages, most recent last, at most 20. */
  references?: TaskReference[];
  /** The task and event this one was branched (or continued) from. */
  branchedFrom?: { taskId: string; title: string; seq?: number; inherited?: boolean };
  /**
   * The next run starts on a fresh Hermes session and carries the conversation so far in its instructions: the
   * task moved to another profile (chat to agent, plan confirmed), or it is a branch or continuation that could
   * not fork the Hermes session.
   */
  carryOver?: boolean;
  /** Text handed to the next run instead of the transcript (a continuation's inherited summary). */
  carryOverText?: string;
  /** Compaction summaries already reported in the work log. */
  compactions?: number;
  /** A "continue in a new task" offer was made. */
  longOffered?: boolean;
  /**
   * The project's knowledge files when the task was created (file changes apply to tasks created afterwards), with
   * the project owner's id (whose rows they are). Copied into the task's working folder before its first run.
   */
  projectFiles?: { owner: string; project: string; files: { id: string; name: string; size: number }[] };
  /** Where the project files were copied on the computer the task works on, once done. */
  projectFilesAt?: string;
  /** Waiting for a free run slot (the per-user limit on tasks running at once). */
  queued?: boolean;
  /** The prompt of a run still waiting for a slot (its user message is already shown), so a restart can requeue it. */
  pendingStart?: string;
  /** The task's working folder was cleaned up after being idle; its files are restored on the next run. */
  sweptAt?: string;
  /** The last time a run of this task ended, for the workspace sweep. */
  lastRunAt?: string;
}

export const ext = (meta: TaskMeta): ExtMeta => meta as ExtMeta;
export const extOf = (task: TaskRecord): ExtMeta => ext(task.meta);

export const MAX_REFERENCES = 20;

/** Adds references, newest last; a reference given again moves to the end; only the 20 most recent are kept. */
export function mergeReferences(current: TaskReference[] | undefined, added: TaskReference[]): TaskReference[] {
  const ids = new Set(added.map((r) => r.id));
  return [...(current ?? []).filter((r) => !ids.has(r.id)), ...added].slice(-MAX_REFERENCES);
}

/** The conversation as plain text (user messages and the agent's replies), cut from the start to `maxChars`. */
export function transcriptText(events: AgentEvent[], maxChars = 40_000, opts: { dropLastUser?: boolean } = {}): string {
  const lines: string[] = [];
  for (const e of events) {
    if (e.type === "user.message") lines.push(`User: ${e.text.trim()}`);
    else if (e.type === "message.completed" && e.text.trim()) lines.push(`Assistant: ${e.text.trim()}`);
    else if (e.type === "file.created") lines.push(`(File saved: ${e.name})`);
  }
  if (opts.dropLastUser) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith("User: ")) {
        lines.splice(i, 1);
        break;
      }
    }
  }
  let text = lines.join("\n\n");
  if (text.length > maxChars) text = `[earlier messages left out]\n\n${text.slice(text.length - maxChars)}`;
  return text;
}
