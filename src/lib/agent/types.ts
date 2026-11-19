// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Shared contract between the UI and the agent backend. Read-only for everyone except the orchestrator. */
import type { ModeId } from "@/config/brand";

export type Effort = "medium" | "high" | "extra" | "ultra";
export type Speed = "normal" | "fast";
export type RunTarget = { kind: "cloud-temporary" } | { kind: "cloud-persistent"; computerId: string } | { kind: "local" };

export interface TaskSummary { id: string; title: string; status: TaskStatus; createdAt: string; updatedAt: string; projectId?: string | null; favorite?: boolean; mode?: ModeId; effort?: Effort; pinned?: boolean; pinnedAt?: string | null; unread?: boolean; section?: TaskSection; interaction?: Interaction; role?: TaskRole; parentTaskId?: string | null; childKind?: ChildKind | null; references?: TaskReference[] }
/** Where the sidebar lists a task: "Pinned", under its project, or "Tasks". */
export type TaskSection = "pinned" | "project" | "tasks";
export type TaskStatus = "waking" | "running" | "waiting" | "stopped" | "completed" | "error";
/** How the agent works on a task: the full agent with a computer, a light question-and-answer chat, or planning before anything runs. */
export type Interaction = "agent" | "chat" | "plan";
/** The caller's relation to a task: its owner, or someone the owner invited. */
export type TaskRole = "owner" | "collaborator";
/** A task made from another one: a parallel task the agent started, or a side chat. */
export type ChildKind = "parallel" | "side";
/** An earlier task a message refers to. */
export interface TaskReference { id: string; title: string }

/**
 * A file attached to a message: a link (`url`), or a file uploaded to the user's computer (`path`, from
 * `POST /api/tasks/uploads`) with its size, type and, for text, a short preview. The agent gets the path, never the bytes.
 */
export interface TaskAttachment { name: string; url?: string; path?: string; size?: number; mime?: string; preview?: string }
export interface CreateTaskInput { prompt: string; mode: ModeId; effort?: Effort; speed?: Speed; target?: RunTarget; projectId?: string | null; connectors?: string[]; skills?: string[]; attachments?: TaskAttachment[]; interaction?: Interaction; references?: string[] }

/** Events as stored and streamed. `seq` is a per-task increasing number so a client can resume. */
export type AgentEvent = { seq: number; at: string } & (
  | { type: "user.message"; text: string }
  | { type: "message.delta"; text: string }
  | { type: "message.completed"; text: string }
  | { type: "reasoning.delta"; text: string }
  | { type: "tool.started"; callId: string; tool: string; preview?: string }
  | { type: "tool.completed"; callId: string; tool: string; preview?: string; error?: boolean; durationMs?: number }
  | { type: "plan.updated"; steps: { title: string; status: "pending" | "active" | "done" }[] }
  | { type: "approval.request"; requestId: string; kind: string; title: string; detail?: string; choices: string[] }
  /** An approval was answered (from the card, or elsewhere, such as by text message). */
  | { type: "approval.resolved"; requestId: string; choice: string }
  | { type: "question"; requestId: string; text: string; options?: string[]; multiple?: boolean }
  | { type: "file.created"; fileId: string; name: string; mime?: string; size?: number }
  | { type: "status"; status: TaskStatus; brief?: string }
  | { type: "run.completed"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "run.failed"; error: string }
  /** First event of a branch: the task it continues and the reply it was branched at. */
  | { type: "task.branched"; fromTaskId: string; fromTitle: string; inherited?: boolean }
  /** Hermes compacted the conversation to stay inside the model's context window. */
  | { type: "context.compacted"; summary?: string; long?: boolean }
  /** The task switched how the agent works (chat to agent, plan confirmed, plan mode toggled). */
  | { type: "interaction.changed"; interaction: Interaction }
  /** The message that follows refers to these earlier tasks. */
  | { type: "references.added"; tasks: TaskReference[] }
);

/** Live view of the computer a task runs on. */
export interface ComputerView { vncUrl: string | null; viewOnly: boolean; width: number; height: number }

/** Which Claude model a mode maps to. All calls run at high effort. */
export const MODEL_MAP: Record<ModeId, string> = { lite: "claude-haiku-5-5", standard: "claude-sonnet-5-5", max: "claude-opus-5-5", flex: "claude-opus-5-5" };
export function modelFor(mode: ModeId, effort?: Effort): string {
  if (mode === "max" && (effort === "extra" || effort === "ultra")) return "claude-fable-5-2";
  return MODEL_MAP[mode];
}
