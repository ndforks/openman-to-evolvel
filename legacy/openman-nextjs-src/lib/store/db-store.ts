// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Database-backed store for one user. Every query is scoped by that user's id. */
import type { AgentEvent } from "@/lib/agent/types";
import {
  appendTaskEvents,
  deleteTaskRow,
  getTaskRow,
  insertTaskRow,
  lastTaskSeq,
  listTaskEvents,
  listTaskRows,
  updateTaskRow,
} from "@/lib/db/tasks";
import type { Store, TaskPatch, TaskRecord } from "./types";

export class DbStore implements Store {
  // "supabase" keeps the relay's owner checks (kind + ownerId) unchanged.
  readonly kind = "supabase" as const;
  constructor(readonly ownerId: string) {}

  listTasks(opts?: { archived?: boolean | "all" }): Promise<TaskRecord[]> {
    return listTaskRows(this.ownerId, opts);
  }
  getTask(id: string): Promise<TaskRecord | null> {
    return getTaskRow(this.ownerId, id);
  }
  createTask(task: TaskRecord): Promise<void> {
    return insertTaskRow(this.ownerId, task);
  }
  async updateTask(id: string, patch: TaskPatch): Promise<void> {
    await updateTaskRow(this.ownerId, id, patch);
  }
  appendEvents(id: string, events: AgentEvent[]): Promise<void> {
    return appendTaskEvents(this.ownerId, id, events);
  }
  listEvents(id: string, afterSeq?: number): Promise<AgentEvent[]> {
    return listTaskEvents(this.ownerId, id, afterSeq);
  }
  lastSeq(id: string): Promise<number> {
    return lastTaskSeq(this.ownerId, id);
  }
  deleteTask(id: string): Promise<boolean> {
    return deleteTaskRow(this.ownerId, id);
  }
}
