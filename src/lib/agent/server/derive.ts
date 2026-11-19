/**
 * Tasks made from other tasks:
 * - Branch: a new task that keeps the conversation and files up to one reply (Hermes session fork when the branch
 *   is at the latest reply, else the conversation carried over), named "<title> (branch)", same project,
 *   connectors, mode and settings, with a "Branched from" divider.
 * - Continue in a new task: for a task that grew long, a new task that inherits a summary and the files.
 * - Side chats and parallel tasks: child tasks found through `meta.parentTaskId`.
 */
import type { AgentEvent, ChildKind } from "@/lib/agent/types";
import { isValidTaskId, type Store, type StoredFile, type TaskRecord } from "@/lib/store/types";
import { orgoClientFor, computerFor } from "./connection";
import { CHAT_PROFILE } from "./agent-tools-mcp";
import { liveRuntime, isActiveStatus } from "./relay";
import { remoteComputerId } from "./remote";
import { newTaskId } from "./ids";
import { ext, extOf, transcriptText, type ExtMeta } from "./task-meta";
import { pickUpstream } from "./upstream";

export class DeriveError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Branches in the last minute per owner (at most 10). */
const g = globalThis as typeof globalThis & { __omBranchHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__omBranchHits ??= new Map<string, number[]>());
function rateLimit(ownerId: string): void {
  const now = Date.now();
  const recent = (hits.get(ownerId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) throw new DeriveError("You can make at most 10 branches a minute. Try again shortly.", 429);
  recent.push(now);
  hits.set(ownerId, recent);
}

/** Copies the source task's folder on the home computer to the new task's folder. Returns both paths, or null. */
async function copyFolder(ownerId: string, fromId: string, toId: string): Promise<{ from: string; to: string } | null> {
  const orgo = orgoClientFor(ownerId);
  const homeId = computerFor(ownerId)?.computerId;
  if (!orgo || !homeId || !/^[A-Za-z0-9]{8,64}$/.test(fromId) || !/^[A-Za-z0-9]{8,64}$/.test(toId)) return null;
  try {
    const out = await orgo.bash(homeId, `mkdir -p "$HOME/tasks/${toId}" && { [ -d "$HOME/tasks/${fromId}" ] && cp -a "$HOME/tasks/${fromId}/." "$HOME/tasks/${toId}/" || true; } && cd "$HOME/tasks/${toId}" && pwd`, 120);
    const to = out.output.trim().split("\n").pop()?.trim();
    if (!to?.startsWith("/")) return null;
    return { from: to.slice(0, to.length - toId.length) + fromId, to };
  } catch (err) {
    console.warn(`[derive] could not copy the files of task ${fromId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** The files announced up to `uptoSeq`, with paths moved into the new task's folder when they were in the old one's. */
function filesFor(src: TaskRecord, events: AgentEvent[], folders: { from: string; to: string } | null): Record<string, StoredFile> {
  const announced = new Set(events.filter((e) => e.type === "file.created").map((e) => (e as Extract<AgentEvent, { type: "file.created" }>).fileId));
  const out: Record<string, StoredFile> = {};
  for (const [id, file] of Object.entries(src.meta.files ?? {})) {
    if (!announced.has(id)) continue;
    const moved = folders && file.path.startsWith(`${folders.from}/`) ? `${folders.to}${file.path.slice(folders.from.length)}` : file.path;
    out[id] = { ...file, path: moved };
  }
  return out;
}

/** The meta a derived task keeps from its source: mode, effort, speed, where it runs, connectors, skills, instructions, references, interaction. */
function inheritedMeta(src: TaskRecord, id: string): ExtMeta {
  const m = extOf(src);
  return {
    mode: m.mode,
    effort: m.effort,
    speed: m.speed,
    target: m.target,
    connectors: m.connectors,
    ...(m.connectorLabels ? { connectorLabels: m.connectorLabels } : {}),
    ...(m.skills ? { skills: m.skills } : {}),
    ...(m.instructions ? { instructions: m.instructions } : {}),
    ...(m.references ? { references: m.references } : {}),
    ...(m.interaction ? { interaction: m.interaction } : {}),
    ...(m.fallbackModel ? { fallbackModel: m.fallbackModel } : {}),
    sessionId: `openman-${id}`,
    runId: null,
    queue: [],
    turns: m.turns,
  };
}

async function loadOwn(store: Store, id: string): Promise<TaskRecord> {
  if (!isValidTaskId(id)) throw new DeriveError("Task not found.", 404);
  const live = liveRuntime(store, id);
  const task = live?.task ?? (await store.getTask(id));
  if (!task) throw new DeriveError("Task not found.", 404);
  return task;
}

const stamp = (events: Omit<AgentEvent, "seq">[], start = 1): AgentEvent[] => events.map((e, i) => ({ ...e, seq: start + i }) as AgentEvent);

/** Branch: see the module comment. `uptoSeq` is the last event of the reply to branch at (default: everything). */
export async function branchTask(store: Store, id: string, uptoSeq?: number): Promise<TaskRecord> {
  const src = await loadOwn(store, id);
  if (extOf(src).childKind) throw new DeriveError("Parallel tasks and side chats cannot be branched.");
  rateLimit(store.ownerId);
  const all = liveRuntime(store, id) ? await liveRuntime(store, id)!.allEvents() : await store.listEvents(id);
  const last = all.reduce((max, e) => Math.max(max, e.seq), 0);
  const upto = uptoSeq && uptoSeq > 0 ? Math.min(uptoSeq, last) : last;
  const kept = all.filter((e) => e.seq <= upto && e.type !== "status" && e.type !== "task.branched" && e.type !== "approval.request" && e.type !== "question" && e.type !== "approval.resolved");
  if (!kept.some((e) => e.type === "message.completed")) throw new DeriveError("There is no reply to branch from yet.");

  const newId = newTaskId();
  const now = new Date().toISOString();
  const running = isActiveStatus(src.status);
  const meta = inheritedMeta(src, newId);
  meta.branchedFrom = { taskId: src.id, title: src.title, seq: upto };
  const folders = remoteComputerId(meta.target) ? null : await copyFolder(store.ownerId, src.id, newId);
  meta.files = filesFor(src, kept, folders);

  // At the latest reply of a task at rest the Hermes session is forked as it is; otherwise (an earlier reply, or a
  // run in flight that would add to the session meanwhile) the kept conversation is carried over to a fresh one.
  const lastReplySeq = all.filter((e) => e.type === "message.completed").reduce((max, e) => Math.max(max, e.seq), 0);
  let forked = false;
  if (!running && upto >= lastReplySeq) {
    const interaction = extOf(src).interaction ?? "agent";
    const profile = remoteComputerId(meta.target) ? "om-remote" : interaction === "agent" ? undefined : CHAT_PROFILE;
    const upstream = pickUpstream(store.ownerId, undefined, profile);
    if (upstream.fork) {
      try {
        await upstream.fork(src.meta.sessionId, meta.sessionId, `${src.title} (branch)`);
        forked = true;
      } catch (err) {
        console.warn(`[derive] could not fork the session of task ${src.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  if (!forked) {
    meta.carryOver = true;
    meta.carryOverText = transcriptText(kept, 40_000);
  }

  const task: TaskRecord = {
    id: newId,
    title: `${src.title.replace(/\s*\(branch\)$/, "")} (branch)`.slice(0, 300),
    status: running ? "stopped" : "completed",
    createdAt: now,
    updatedAt: now,
    projectId: src.projectId ?? null,
    favorite: false,
    archived: false,
    meta,
  };
  await store.createTask(task);
  const events = stamp([
    ...kept.map((e) => {
      const { seq: _seq, ...rest } = e;
      void _seq;
      return rest;
    }),
    { type: "task.branched", fromTaskId: src.id, fromTitle: src.title, at: now },
    { type: "status", status: task.status, at: now },
  ] as Omit<AgentEvent, "seq">[]);
  await store.appendEvents(newId, events);
  return task;
}

/** Continue in a new task: inherits a summary (Hermes' latest compaction summary, else the conversation's tail) and the files. */
export async function continueTask(store: Store, id: string): Promise<TaskRecord> {
  const src = await loadOwn(store, id);
  if (isActiveStatus(src.status)) throw new DeriveError("Wait for the task to finish (or stop it) before continuing in a new task.", 409);
  rateLimit(store.ownerId);
  const all = await store.listEvents(id);
  const newId = newTaskId();
  const now = new Date().toISOString();
  const meta = inheritedMeta(src, newId);
  meta.turns = 0;
  meta.branchedFrom = { taskId: src.id, title: src.title, inherited: true };
  const folders = remoteComputerId(meta.target) ? null : await copyFolder(store.ownerId, src.id, newId);
  meta.files = filesFor(src, all, folders);
  const compacted = [...all].reverse().find((e) => e.type === "context.compacted" && e.summary) as Extract<AgentEvent, { type: "context.compacted" }> | undefined;
  const fileList = Object.values(meta.files).map((f) => `- ${f.path}`).join("\n");
  meta.carryOver = true;
  meta.carryOverText = [
    `This task continues "${src.title}", which grew too long. What it established:`,
    compacted?.summary ? `Summary:\n${compacted.summary}` : transcriptText(all, 24_000),
    fileList ? `Files it produced (copied into this task's folder):\n${fileList}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const task: TaskRecord = {
    id: newId,
    title: `${src.title.replace(/\s*\((branch|continued)\)$/, "")} (continued)`.slice(0, 300),
    status: "completed",
    createdAt: now,
    updatedAt: now,
    projectId: src.projectId ?? null,
    favorite: false,
    archived: false,
    meta,
  };
  await store.createTask(task);
  const fileEvents = all.filter((e) => e.type === "file.created" && meta.files?.[(e as Extract<AgentEvent, { type: "file.created" }>).fileId]);
  await store.appendEvents(
    newId,
    stamp([
      ...fileEvents.map((e) => {
        const { seq: _seq, ...rest } = e;
        void _seq;
        return { ...rest, at: now };
      }),
      { type: "task.branched", fromTaskId: src.id, fromTitle: src.title, inherited: true, at: now },
      { type: "status", status: "completed", at: now },
    ] as Omit<AgentEvent, "seq">[]),
  );
  return task;
}

/** Child tasks of a task (its parallel tasks, or its side chats), oldest first. */
export async function childrenOf(store: Store, id: string, kind: ChildKind): Promise<TaskRecord[]> {
  const all = await store.listTasks({ archived: "all" });
  return all.filter((t) => extOf(t).parentTaskId === id && extOf(t).childKind === kind).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/** Whether a task is hidden from the task list (side chats live inside their task). */
export const isHiddenChild = (task: TaskRecord) => ext(task.meta).childKind === "side";
