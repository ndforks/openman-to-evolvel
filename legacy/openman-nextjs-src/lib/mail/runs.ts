// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Starts and continues tasks for a user without a request from them (inbound mail, SMS, calls),
 * and waits for the run a message started to finish. Uses the agent server's own functions only.
 */
import type { ModeId } from "@/config/brand";
import type { AgentEvent } from "@/lib/agent/types";
import { primeConnection, primeConnectionFor } from "@/lib/agent/server/connection";
import { readTaskFile, listTaskFiles, type TaskFile } from "@/lib/agent/server/files";
import { refreshOwner } from "@/lib/agent/server/relay";
import { createTask, fileSourceFor, runtimeFor } from "@/lib/agent/server/tasks";
import { DEV_USER_ID } from "@/lib/session";
import { DbStore } from "@/lib/store";

export interface RunResult {
  ok: boolean;
  /** The agent's final answer (or what it had written when the run failed). */
  text: string;
  error?: string;
  /** Files the agent wrote during this run. */
  files: TaskFile[];
}

const RUN_TIMEOUT_MS = 45 * 60_000;

async function storeFor(userId: string): Promise<DbStore> {
  const store = new DbStore(userId);
  // The dev user's agent comes from the env setup, which `primeConnectionFor` never grants.
  if (userId === DEV_USER_ID) await primeConnection({ userId, email: "", name: "", plan: "", workspaceId: null, dev: true });
  else await primeConnectionFor(userId);
  refreshOwner(store);
  return store;
}

/** Creates a task as `userId` and returns its id plus a promise for the outcome of its first run. */
export async function startTaskFor(
  userId: string,
  input: { prompt: string; mode?: ModeId; projectId?: string | null; attachments?: { name: string; url: string }[] },
): Promise<{ taskId: string; done: Promise<RunResult> }> {
  const store = await storeFor(userId);
  const task = await createTask(store, { prompt: input.prompt, mode: input.mode ?? "standard", projectId: input.projectId ?? null, attachments: input.attachments });
  const done = waitForRun(store, task.id, 0, null);
  return { taskId: task.id, done };
}

/**
 * Sends a follow-up into an existing task (queued if a run is in flight). Null when the task is gone.
 * `done` resolves when the run that carries this message ends.
 */
export async function continueTaskFor(userId: string, taskId: string, text: string): Promise<{ taskId: string; done: Promise<RunResult> } | null> {
  const store = await storeFor(userId);
  const runtime = await runtimeFor(store, taskId);
  if (!runtime) return null;
  const events = await runtime.allEvents();
  const after = events.length ? events[events.length - 1].seq : 0;
  const done = waitForRun(store, taskId, after, text);
  await runtime.queueMessage(text);
  return { taskId, done };
}

/** True when the task exists for this user and is not running right now. */
export async function taskAtRest(userId: string, taskId: string): Promise<boolean | null> {
  const store = await storeFor(userId);
  const runtime = await runtimeFor(store, taskId);
  if (!runtime) return null;
  return runtime.atRest;
}

/**
 * Waits for the first run that starts after `after` with a `user.message` (matching `text` when given)
 * and ends with `run.completed`, `run.failed` or a stop.
 */
function waitForRun(store: DbStore, taskId: string, after: number, text: string | null): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    let started = false;
    let startedAt = "";
    let lastText = "";
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const finish = (r: Omit<RunResult, "files">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      void filesSince(store, taskId, startedAt).then((files) => resolve({ ...r, files }));
    };
    const timer = setTimeout(() => finish({ ok: false, text: lastText, error: "The task is still running. Open it to see progress." }), RUN_TIMEOUT_MS);
    timer.unref?.();
    const onEvent = (e: AgentEvent) => {
      if (settled) return;
      if (!started) {
        if (e.type === "user.message" && (text === null || e.text === text)) {
          started = true;
          startedAt = e.at;
        }
        return;
      }
      if (e.type === "message.completed" && e.text.trim()) lastText = e.text;
      else if (e.type === "run.completed") finish({ ok: true, text: lastText });
      else if (e.type === "run.failed") finish({ ok: false, text: lastText, error: e.error });
      else if (e.type === "status" && e.status === "stopped") finish({ ok: false, text: lastText, error: "The task was stopped." });
    };
    void (async () => {
      const runtime = await runtimeFor(store, taskId);
      if (!runtime) return finish({ ok: false, text: "", error: "The task no longer exists." });
      unsubscribe = await runtime.subscribe(after, onEvent);
      if (settled) unsubscribe();
    })().catch((err) => finish({ ok: false, text: "", error: err instanceof Error ? err.message : String(err) }));
  });
}

async function filesSince(store: DbStore, taskId: string, sinceIso: string): Promise<TaskFile[]> {
  try {
    const source = await fileSourceFor(store, taskId);
    if (!source) return [];
    const files = await listTaskFiles(source);
    return sinceIso ? files.filter((f) => !f.at || f.at >= sinceIso) : files;
  } catch {
    return [];
  }
}

/** Bytes of task files, up to `maxBytes` in total; the rest are listed in `skipped`. */
export async function readFilesFor(userId: string, taskId: string, files: TaskFile[], maxBytes: number): Promise<{ attached: { name: string; mime?: string; bytes: Buffer }[]; skipped: TaskFile[] }> {
  const attached: { name: string; mime?: string; bytes: Buffer }[] = [];
  const skipped: TaskFile[] = [];
  const store = new DbStore(userId);
  const source = await fileSourceFor(store, taskId).catch(() => null);
  let total = 0;
  for (const f of files) {
    if (!source || (f.size !== undefined && total + f.size > maxBytes)) {
      skipped.push(f);
      continue;
    }
    try {
      const content = await readTaskFile(source, f.fileId);
      if (!content || total + content.bytes.length > maxBytes) {
        skipped.push(f);
        continue;
      }
      total += content.bytes.length;
      attached.push({ name: f.name, mime: f.mime, bytes: content.bytes });
    } catch {
      skipped.push(f);
    }
  }
  return { attached, skipped };
}
