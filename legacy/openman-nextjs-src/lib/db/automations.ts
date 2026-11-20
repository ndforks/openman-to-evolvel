// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Automations and their runs. User-facing functions take the owner's user id and scope by it; the
 * functions marked "engine" read across users and are only called by the tick and the inbound hooks.
 */
import type { AutomationKind, RepeatRule, RunStatus, RunTrigger, StoredTrigger } from "@/lib/automations/types";
import { db, fail, iso } from "./client";

export interface AutomationRecord {
  id: string;
  userId: string;
  name: string;
  kind: AutomationKind;
  prompt: string;
  repeat: RepeatRule | null;
  timezone: string;
  endsAt: string | null;
  triggers: StoredTrigger[];
  triggerState: Record<string, unknown>;
  mode: string;
  runIn: "new" | "same";
  projectId: string | null;
  connectors: string[];
  enabled: boolean;
  pausedReason: string | null;
  failureCount: number;
  taskId: string | null;
  sourceTaskId: string | null;
  hookToken: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  pollAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  user_id: string;
  name: string;
  kind: AutomationKind;
  prompt: string;
  repeat: RepeatRule | Record<string, never> | null;
  timezone: string;
  ends_at: string | null;
  triggers: StoredTrigger[] | null;
  trigger_state: Record<string, unknown> | null;
  mode: string;
  run_in: "new" | "same";
  project_id: string | null;
  connectors: string[] | null;
  enabled: boolean;
  paused_reason: string | null;
  failure_count: number;
  task_id: string | null;
  source_task_id: string | null;
  hook_token: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  poll_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id,user_id,name,kind,prompt,repeat,timezone,ends_at,triggers,trigger_state,mode,run_in,project_id,connectors,enabled,paused_reason,failure_count,task_id,source_task_id,hook_token,last_run_at,next_run_at,poll_at,created_at,updated_at";

const isoOrNull = (v: string | null) => (v ? iso(v) : null);

function fromRow(r: Row): AutomationRecord {
  const repeat = r.repeat && "freq" in r.repeat ? (r.repeat as RepeatRule) : null;
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    kind: r.kind,
    prompt: r.prompt,
    repeat,
    timezone: r.timezone,
    endsAt: isoOrNull(r.ends_at),
    triggers: r.triggers ?? [],
    triggerState: r.trigger_state ?? {},
    mode: r.mode,
    runIn: r.run_in,
    projectId: r.project_id,
    connectors: r.connectors ?? [],
    enabled: r.enabled,
    pausedReason: r.paused_reason,
    failureCount: r.failure_count,
    taskId: r.task_id,
    sourceTaskId: r.source_task_id,
    hookToken: r.hook_token,
    lastRunAt: isoOrNull(r.last_run_at),
    nextRunAt: isoOrNull(r.next_run_at),
    pollAt: isoOrNull(r.poll_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export type AutomationPatch = Partial<Omit<AutomationRecord, "id" | "userId" | "createdAt" | "updatedAt">>;

function toRow(p: AutomationPatch): Record<string, unknown> {
  const map: Record<string, string> = {
    name: "name",
    kind: "kind",
    prompt: "prompt",
    repeat: "repeat",
    timezone: "timezone",
    endsAt: "ends_at",
    triggers: "triggers",
    triggerState: "trigger_state",
    mode: "mode",
    runIn: "run_in",
    projectId: "project_id",
    connectors: "connectors",
    enabled: "enabled",
    pausedReason: "paused_reason",
    failureCount: "failure_count",
    taskId: "task_id",
    sourceTaskId: "source_task_id",
    hookToken: "hook_token",
    lastRunAt: "last_run_at",
    nextRunAt: "next_run_at",
    pollAt: "poll_at",
  };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || !(k in map)) continue;
    row[map[k]] = k === "repeat" && v === null ? {} : v;
  }
  return row;
}

export async function listAutomations(userId: string): Promise<AutomationRecord[]> {
  const { data, error } = await db().from("automations").select(COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
  if (error) fail("list automations", error);
  return (data as Row[]).map(fromRow);
}

export async function countEnabledAutomations(userId: string): Promise<number> {
  const { count, error } = await db().from("automations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("enabled", true);
  if (error) fail("count automations", error);
  return count ?? 0;
}

export async function getAutomation(userId: string, id: string): Promise<AutomationRecord | null> {
  const { data, error } = await db().from("automations").select(COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get automation", error);
  return data ? fromRow(data as Row) : null;
}

export async function insertAutomation(userId: string, a: AutomationPatch & { name: string; prompt: string }): Promise<AutomationRecord> {
  const { data, error } = await db()
    .from("automations")
    .insert({ ...toRow(a), user_id: userId })
    .select(COLUMNS)
    .single();
  if (error) fail("create automation", error);
  return fromRow(data as Row);
}

export async function updateAutomation(userId: string, id: string, patch: AutomationPatch): Promise<AutomationRecord | null> {
  const row = toRow(patch);
  const { data, error } = await db().from("automations").update(row).eq("user_id", userId).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) fail("update automation", error);
  return data ? fromRow(data as Row) : null;
}

export async function deleteAutomation(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("automations").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete automation", error);
  return (data ?? []).length > 0;
}

// ------------------------------------------------------------------ engine (cross-user)

/** Engine: enabled automations whose next run is due. */
export async function dueAutomations(nowIso: string, limit = 50): Promise<AutomationRecord[]> {
  const { data, error } = await db().from("automations").select(COLUMNS).eq("enabled", true).not("next_run_at", "is", null).lte("next_run_at", nowIso).order("next_run_at").limit(limit);
  if (error) fail("list due automations", error);
  return (data as Row[]).map(fromRow);
}

/** Engine: enabled automations whose triggers need polling (RSS). */
export async function pollableAutomations(nowIso: string, limit = 50): Promise<AutomationRecord[]> {
  const { data, error } = await db().from("automations").select(COLUMNS).eq("enabled", true).not("poll_at", "is", null).lte("poll_at", nowIso).order("poll_at").limit(limit);
  if (error) fail("list pollable automations", error);
  return (data as Row[]).map(fromRow);
}

/**
 * Engine: compare-and-set on one column. Only the caller that still sees `expected` wins, which is
 * what makes concurrent ticks safe without locks.
 */
export async function claimColumn(id: string, column: "next_run_at" | "poll_at", expected: string, next: string | null, extra: Record<string, unknown> = {}): Promise<boolean> {
  // The value read back was cut to milliseconds, so the match is a 1 ms window rather than equality.
  const lo = new Date(Date.parse(expected)).toISOString();
  const hi = new Date(Date.parse(expected) + 1).toISOString();
  const { data, error } = await db().from("automations").update({ [column]: next, ...extra }).eq("id", id).gte(column, lo).lt(column, hi).select("id");
  if (error) fail("claim automation", error);
  return (data ?? []).length > 0;
}

export async function automationByHookToken(token: string): Promise<AutomationRecord | null> {
  const { data, error } = await db().from("automations").select(COLUMNS).eq("hook_token", token).maybeSingle();
  if (error) fail("find webhook", error);
  return data ? fromRow(data as Row) : null;
}

/** Engine: automations with an email trigger (few; filtered in code). */
export async function automationsWithEmailTriggers(): Promise<AutomationRecord[]> {
  const { data, error } = await db().from("automations").select(COLUMNS).eq("enabled", true).contains("triggers", [{ type: "email" }]).limit(1000);
  if (error) fail("list email automations", error);
  return (data as Row[]).map(fromRow);
}

/** Engine: patch without a user id (the engine already holds the record). */
export async function patchAutomationById(id: string, patch: AutomationPatch): Promise<void> {
  const { error } = await db().from("automations").update(toRow(patch)).eq("id", id);
  if (error) fail("update automation", error);
}

// ------------------------------------------------------------------ runs

export interface RunRecord {
  id: string;
  automationId: string;
  userId: string;
  taskId: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  summary: string | null;
  error: string | null;
  attempt: number;
  scheduledFor: string | null;
  retryAt: string | null;
  payload: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
}

interface RunRow {
  id: string;
  automation_id: string;
  user_id: string;
  task_id: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  summary: string | null;
  error: string | null;
  attempt: number;
  scheduled_for: string | null;
  retry_at: string | null;
  payload: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
}

const RUN_COLUMNS = "id,automation_id,user_id,task_id,status,trigger,summary,error,attempt,scheduled_for,retry_at,payload,started_at,finished_at";

const fromRunRow = (r: RunRow): RunRecord => ({
  id: r.id,
  automationId: r.automation_id,
  userId: r.user_id,
  taskId: r.task_id,
  status: r.status,
  trigger: r.trigger,
  summary: r.summary,
  error: r.error,
  attempt: r.attempt,
  scheduledFor: isoOrNull(r.scheduled_for),
  retryAt: isoOrNull(r.retry_at),
  payload: r.payload ?? {},
  startedAt: iso(r.started_at),
  finishedAt: isoOrNull(r.finished_at),
});

export type RunPatch = Partial<Pick<RunRecord, "taskId" | "status" | "summary" | "error" | "retryAt" | "payload" | "finishedAt" | "startedAt">>;

function runRow(p: RunPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.taskId !== undefined) row.task_id = p.taskId;
  if (p.status !== undefined) row.status = p.status;
  if (p.summary !== undefined) row.summary = p.summary;
  if (p.error !== undefined) row.error = p.error;
  if (p.retryAt !== undefined) row.retry_at = p.retryAt;
  if (p.payload !== undefined) row.payload = p.payload;
  if (p.finishedAt !== undefined) row.finished_at = p.finishedAt;
  if (p.startedAt !== undefined) row.started_at = p.startedAt;
  return row;
}

/** Inserts a run. Returns null when that slot (automation, due time, attempt) already has one. */
export async function insertRun(r: { automationId: string; userId: string; status: RunStatus; trigger: RunTrigger; attempt?: number; scheduledFor?: string | null; retryAt?: string | null; payload?: Record<string, unknown> }): Promise<RunRecord | null> {
  const { data, error } = await db()
    .from("automation_runs")
    .insert({
      automation_id: r.automationId,
      user_id: r.userId,
      status: r.status,
      trigger: r.trigger,
      attempt: r.attempt ?? 1,
      scheduled_for: r.scheduledFor ?? null,
      retry_at: r.retryAt ?? null,
      payload: r.payload ?? {},
    })
    .select(RUN_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return null;
    fail("create run", error);
  }
  return fromRunRow(data as RunRow);
}

/** Updates a run; with `fromStatus`, only when it is still in that status (compare-and-set). */
export async function updateRun(id: string, patch: RunPatch, fromStatus?: RunStatus): Promise<boolean> {
  let q = db().from("automation_runs").update(runRow(patch)).eq("id", id);
  if (fromStatus) q = q.eq("status", fromStatus);
  const { data, error } = await q.select("id");
  if (error) fail("update run", error);
  return (data ?? []).length > 0;
}

/** Engine: runs still open (queued for a retry, or running). */
export async function openRuns(limit = 100): Promise<RunRecord[]> {
  const { data, error } = await db().from("automation_runs").select(RUN_COLUMNS).in("status", ["queued", "running"]).order("started_at").limit(limit);
  if (error) fail("list open runs", error);
  return (data as RunRow[]).map(fromRunRow);
}

export async function listRuns(userId: string, opts: { automationId?: string; from?: string; to?: string; limit?: number; status?: RunStatus[] } = {}): Promise<RunRecord[]> {
  let q = db().from("automation_runs").select(RUN_COLUMNS).eq("user_id", userId);
  if (opts.automationId) q = q.eq("automation_id", opts.automationId);
  if (opts.from) q = q.gte("started_at", opts.from);
  if (opts.to) q = q.lt("started_at", opts.to);
  if (opts.status) q = q.in("status", opts.status);
  const { data, error } = await q.order("started_at", { ascending: false }).limit(Math.min(opts.limit ?? 200, 1000));
  if (error) fail("list runs", error);
  return (data as RunRow[]).map(fromRunRow);
}

export async function getRun(userId: string, id: string): Promise<RunRecord | null> {
  const { data, error } = await db().from("automation_runs").select(RUN_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get run", error);
  return data ? fromRunRow(data as RunRow) : null;
}

/** The newest run per automation, for the Manage cards. */
export async function latestRuns(userId: string, automationIds: string[]): Promise<Map<string, RunRecord>> {
  const out = new Map<string, RunRecord>();
  if (automationIds.length === 0) return out;
  const { data, error } = await db().from("automation_runs").select(RUN_COLUMNS).eq("user_id", userId).in("automation_id", automationIds).order("started_at", { ascending: false }).limit(500);
  if (error) fail("list latest runs", error);
  for (const r of (data as RunRow[]).map(fromRunRow)) if (!out.has(r.automationId)) out.set(r.automationId, r);
  return out;
}
