/** How resources look in the public API: snake_case, stable field names, no server-only state. */
import type { AgentEvent, TaskStatus } from "@/lib/agent/types";
import type { ApiTask } from "@/lib/db/public-api";
import type { TaskView } from "@/lib/store/types";
import { snake } from "./casing";

export type PublicStatus = "starting" | "running" | "waiting" | "completed" | "stopped" | "failed";

const STATUS: Record<TaskStatus, PublicStatus> = { waking: "starting", running: "running", waiting: "waiting", completed: "completed", stopped: "stopped", error: "failed" };
export const publicStatus = (s: TaskStatus): PublicStatus => STATUS[s] ?? "running";

const INTERNAL: Record<PublicStatus, TaskStatus> = { starting: "waking", running: "running", waiting: "waiting", completed: "completed", stopped: "stopped", failed: "error" };
export const internalStatus = (s: string): TaskStatus | null => (s in INTERNAL ? INTERNAL[s as PublicStatus] : null);

export function appBase(): string {
  return (process.env.APP_PUBLIC_URL || "http://localhost:3001").replace(/\/+$/, "");
}

export function taskView(t: TaskView, api: ApiTask | null | undefined, base = appBase()) {
  return {
    id: t.id,
    object: "task" as const,
    title: t.title,
    status: publicStatus(t.status),
    mode: t.mode ?? "standard",
    effort: t.effort ?? null,
    project_id: t.projectId ?? null,
    favorite: t.favorite ?? false,
    archived: t.archived,
    source: api ? ("api" as const) : ("app" as const),
    url: `${base}/app/task/${t.id}`,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    ...(api?.outputSchema
      ? {
          structured_output: {
            status: api.structuredState === "done" ? "ready" : api.structuredState === "failed" ? "failed" : "pending",
            value: api.structuredState === "done" ? api.structuredOutput : null,
            error: api.structuredError,
          },
        }
      : {}),
  };
}

export type PublicEvent = { seq: number; type: string; at: string; data: Record<string, unknown> };

/** An event as `{ seq, type, at, data }` with snake_case data. */
export function eventView(e: AgentEvent): PublicEvent {
  const { seq, type, at, ...rest } = e as AgentEvent & Record<string, unknown>;
  const data = snake(rest) as Record<string, unknown>;
  if (type === "status" && typeof data.status === "string") data.status = publicStatus(data.status as TaskStatus);
  return { seq, type, at, data };
}

export interface MessageView {
  id: string;
  seq: number;
  role: "user" | "assistant";
  text: string;
  created_at: string;
}

/** The conversation: what the user sent and each finished assistant message. */
export function messagesOf(events: AgentEvent[]): MessageView[] {
  const out: MessageView[] = [];
  for (const e of events) {
    if (e.type === "user.message") out.push({ id: `msg_${e.seq}`, seq: e.seq, role: "user", text: e.text, created_at: e.at });
    else if (e.type === "message.completed") out.push({ id: `msg_${e.seq}`, seq: e.seq, role: "assistant", text: e.text, created_at: e.at });
  }
  return out;
}

/** The question or approval the task is waiting on, if any. */
export function pendingRequest(events: AgentEvent[], status: TaskStatus) {
  if (status !== "waiting") return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "user.message") return null;
    if (e.type === "question") return { request_id: e.requestId, kind: "question" as const, text: e.text, options: e.options ?? null, multiple: e.multiple ?? false, seq: e.seq };
    if (e.type === "approval.request") return { request_id: e.requestId, kind: "approval" as const, text: e.title, detail: e.detail ?? null, choices: e.choices, seq: e.seq };
  }
  return null;
}

/** The last assistant message, the task's answer. */
export function finalMessage(events: AgentEvent[]): { text: string; seq: number; at: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "message.completed") return { text: e.text, seq: e.seq, at: e.at };
  }
  return null;
}
