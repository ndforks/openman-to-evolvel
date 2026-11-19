/** Storage contract for tasks and their event logs. Two implementations: files under `.data/` and Supabase. */
import type { ModeId } from "@/config/brand";
import type { AgentEvent, Effort, RunTarget, Speed, TaskStatus, TaskSummary } from "@/lib/agent/types";

/** Server-only run state kept next to a task. Never sent to the browser. */
export interface TaskMeta {
  mode: ModeId;
  effort?: Effort;
  speed?: Speed;
  target?: RunTarget;
  connectors?: string[];
  /** Readable names for `connectors` (custom ones as "Name (MCP server `x`)"), used in the agent's instructions. */
  connectorLabels?: string[];
  /** Skills the user asked this task to use (Hermes skill names), including the project's attached skills. */
  skills?: string[];
  /** Hermes session id shared by every run of this task, so follow-ups keep their context. */
  sessionId: string;
  /** Which backend ran the last turn. */
  driver?: "hermes" | "mock";
  /** Hermes run id of the turn in flight; null when the task is idle. */
  runId?: string | null;
  /** Last Hermes event sequence number consumed for `runId`, used to re-attach after a restart. */
  upstreamSeq?: number;
  /** Messages held back until the current run ends. */
  queue?: QueuedMessage[];
  /** Model used in place of the one the mode asks for, once that one was refused for this task. */
  fallbackModel?: string;
  /** Number of runs this task has finished, whatever the outcome. */
  turns?: number;
  /** Project instructions and enabled knowledge, fixed when the task was created and sent with every run. */
  instructions?: string;
  /**
   * Approval cards raised from outside the agent (see `raiseApproval` in the relay) that are still open, with the
   * status the task had before the first of them, restored once all are answered.
   */
  externalApprovals?: { requestId: string; prior: TaskStatus }[];
  /** Files the agent wrote or delivered, by `fileId`. The path stays on the server. */
  files?: Record<string, StoredFile>;
}

/** A file on the agent's computer that a `file.created` event announced. */
export interface StoredFile {
  fileId: string;
  /** Absolute path on the agent's computer. */
  path: string;
  name: string;
  mime?: string;
  size?: number;
  /** Changes every time the agent writes the file again, so a cached copy can be told apart. */
  version: string;
  /** When the file was first announced. */
  at?: string;
}

export interface QueuedMessage {
  text: string;
  /** True when the `user.message` event for it has already been emitted. */
  echoed: boolean;
}

export interface TaskRecord extends TaskSummary {
  meta: TaskMeta;
  /** Hidden from the default task list. */
  archived?: boolean;
}

export type TaskPatch = Partial<Pick<TaskRecord, "title" | "status" | "updatedAt" | "favorite" | "projectId" | "archived" | "meta" | "pinnedAt" | "unread">>;

/** What the task routes send for a task: the shared summary plus `archived`. */
export type TaskView = TaskSummary & { archived: boolean };

export interface Store {
  readonly kind: "file" | "supabase";
  /** `"local"` for the file store, the signed-in user's id for the database. */
  readonly ownerId: string;
  /** Unarchived tasks by default; `archived: true` for the archive, `"all"` for both. */
  listTasks(opts?: { archived?: boolean | "all" }): Promise<TaskRecord[]>;
  getTask(id: string): Promise<TaskRecord | null>;
  createTask(task: TaskRecord): Promise<void>;
  updateTask(id: string, patch: TaskPatch): Promise<void>;
  /** Appends events. Must tolerate a retry of a batch that was already written. */
  appendEvents(id: string, events: AgentEvent[]): Promise<void>;
  /** Events with `seq > afterSeq`, in order. */
  listEvents(id: string, afterSeq?: number): Promise<AgentEvent[]>;
  /** Highest stored `seq`, or 0 when the task has no events. */
  lastSeq(id: string): Promise<number>;
  /** Removes the task and everything stored with it. False when there was no such task. */
  deleteTask(id: string): Promise<boolean>;
}

export function toSummary(task: TaskRecord): TaskView {
  return {
    archived: task.archived ?? false,
    id: task.id,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    projectId: task.projectId ?? null,
    favorite: task.favorite ?? false,
    pinned: Boolean(task.pinnedAt),
    pinnedAt: task.pinnedAt ?? null,
    unread: task.unread ?? false,
    section: task.pinnedAt ? "pinned" : task.projectId ? "project" : "tasks",
    mode: task.meta?.mode,
    ...(task.meta?.effort ? { effort: task.meta.effort } : {}),
  };
}

const TASK_ID = /^[A-Za-z0-9_-]{6,64}$/;
/** Task ids end up in file paths and URLs, so only a safe alphabet is accepted. */
export function isValidTaskId(id: string): boolean {
  return TASK_ID.test(id);
}
