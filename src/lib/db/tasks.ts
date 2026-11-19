// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Tasks, their ordered event logs and the files they produced. Every function takes the owner's
 * user id and scopes by it. `src/lib/store/db-store.ts` wraps these as the relay's `Store`.
 */
import type { AgentEvent, TaskStatus } from "@/lib/agent/types";
import type { StoredFile, TaskMeta, TaskPatch, TaskRecord } from "@/lib/store/types";
import { db, fail, iso } from "./client";

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  project_id: string | null;
  favorite: boolean;
  archived: boolean;
  pinned_at: string | null;
  unread: boolean;
  meta: TaskMeta;
  created_at: string;
  updated_at: string;
}

const TASK_COLUMNS = "id,title,status,project_id,favorite,archived,pinned_at,unread,meta,created_at,updated_at";
/** PostgREST returns at most 1000 rows per request, so long logs are read in pages. */
const PAGE = 1000;

function fromRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    projectId: row.project_id,
    favorite: row.favorite,
    archived: row.archived,
    pinnedAt: row.pinned_at ? iso(row.pinned_at) : null,
    unread: row.unread ?? false,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    meta: row.meta ?? ({} as TaskMeta),
  };
}

/** Columns mirrored out of `meta` so they can be queried without opening the JSON. */
function metaColumns(meta: TaskMeta): Record<string, unknown> {
  return {
    mode: meta.mode ?? "standard",
    effort: meta.effort ?? null,
    target: meta.target ?? null,
    computer_id: meta.target?.kind === "cloud-persistent" ? meta.target.computerId : null,
    hermes_session_id: meta.sessionId ?? null,
  };
}

export async function listTaskRows(userId: string, opts: { archived?: boolean | "all"; projectId?: string; limit?: number } = {}): Promise<TaskRecord[]> {
  let q = db().from("tasks").select(TASK_COLUMNS).eq("user_id", userId);
  if (opts.archived !== "all") q = q.eq("archived", opts.archived ?? false);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(opts.limit ?? 300);
  if (error) fail("list tasks", error);
  return (data as TaskRow[]).map(fromRow);
}

export async function getTaskRow(userId: string, id: string): Promise<TaskRecord | null> {
  const { data, error } = await db().from("tasks").select(TASK_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get task", error);
  return data ? fromRow(data as TaskRow) : null;
}

export async function insertTaskRow(userId: string, task: TaskRecord): Promise<void> {
  const { error } = await db()
    .from("tasks")
    .insert({
      id: task.id,
      user_id: userId,
      title: task.title,
      status: task.status,
      project_id: task.projectId ?? null,
      favorite: task.favorite ?? false,
      archived: task.archived ?? false,
      meta: task.meta,
      ...metaColumns(task.meta),
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    });
  if (error) fail("create task", error);
}

/** Applies a patch. Returns false when the task is not the user's. */
export async function updateTaskRow(userId: string, id: string, patch: TaskPatch): Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  if (patch.archived !== undefined) row.archived = patch.archived;
  if (patch.projectId !== undefined) row.project_id = patch.projectId;
  if (patch.pinnedAt !== undefined) row.pinned_at = patch.pinnedAt;
  if (patch.unread !== undefined) row.unread = patch.unread;
  if (patch.meta !== undefined) Object.assign(row, { meta: patch.meta }, metaColumns(patch.meta));
  if (Object.keys(row).length === 0 && patch.updatedAt === undefined) return true;
  // tasks has no updated_at trigger: the relay stamps activity, edits keep the old time.
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt;
  const { data, error } = await db().from("tasks").update(row).eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("update task", error);
  if (patch.meta?.files) await syncTaskFiles(userId, id, Object.values(patch.meta.files));
  return (data ?? []).length > 0;
}

/** Deletes the task with its events, files and share link (cascade). */
export async function deleteTaskRow(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("tasks").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete task", error);
  return (data ?? []).length > 0;
}

export async function appendTaskEvents(userId: string, id: string, events: AgentEvent[]): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => ({ task_id: id, seq: e.seq, user_id: userId, at: e.at, type: e.type, payload: e }));
  // A retried batch is a no-op instead of a primary-key error.
  const { error } = await db().from("task_events").upsert(rows, { onConflict: "task_id,seq", ignoreDuplicates: true });
  if (error) fail("append events", error);
}

export async function listTaskEvents(userId: string, id: string, afterSeq = 0): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  let cursor = afterSeq;
  for (;;) {
    const { data, error } = await db()
      .from("task_events")
      .select("seq,payload")
      .eq("user_id", userId)
      .eq("task_id", id)
      .gt("seq", cursor)
      .order("seq", { ascending: true })
      .limit(PAGE);
    if (error) fail("list events", error);
    const page = (data ?? []) as { seq: number; payload: AgentEvent }[];
    for (const row of page) events.push(row.payload);
    if (page.length < PAGE) return events;
    cursor = Number(page[page.length - 1].seq);
  }
}

export async function lastTaskSeq(userId: string, id: string): Promise<number> {
  const { data, error } = await db()
    .from("task_events")
    .select("seq")
    .eq("user_id", userId)
    .eq("task_id", id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("read last seq", error);
  return data ? Number((data as { seq: number }).seq) : 0;
}

// ------------------------------------------------------------------ files

export interface TaskFileRow {
  fileId: string;
  name: string;
  path: string;
  mime: string | null;
  size: number | null;
  version: string | null;
  createdAt: string;
}

async function syncTaskFiles(userId: string, taskId: string, files: StoredFile[]): Promise<void> {
  if (files.length === 0) return;
  const rows = files.map((f) => ({
    task_id: taskId,
    user_id: userId,
    file_id: f.fileId,
    name: f.name,
    path: f.path ?? "",
    mime: f.mime ?? null,
    size: f.size ?? null,
    version: f.version ?? null,
    ...(f.at ? { created_at: f.at } : {}),
  }));
  const { error } = await db().from("task_files").upsert(rows, { onConflict: "task_id,file_id" });
  // The file list in `meta` stays the source of truth; this table is an index, so a failure is only logged.
  if (error) console.warn(`[db] could not index files of task ${taskId}: ${error.message}`);
}

export async function listTaskFileRows(userId: string, taskId: string): Promise<TaskFileRow[]> {
  const { data, error } = await db()
    .from("task_files")
    .select("file_id,name,path,mime,size,version,created_at")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) fail("list task files", error);
  return (data as { file_id: string; name: string; path: string; mime: string | null; size: number | null; version: string | null; created_at: string }[]).map((r) => ({
    fileId: r.file_id,
    name: r.name,
    path: r.path,
    mime: r.mime,
    size: r.size === null ? null : Number(r.size),
    version: r.version,
    createdAt: iso(r.created_at),
  }));
}
