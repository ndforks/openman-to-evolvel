/**
 * Operator metrics for `/app/admin`: counts per day and the recent error log. Aggregates only; no task titles, no
 * prompts, no user ids (error rows carry the hashed user). Server only.
 */
import { db, fail } from "@/lib/db/client";

export interface DayCount {
  day: string;
  count: number;
}
export interface TaskDay {
  day: string;
  total: number;
  failed: number;
  stopped: number;
  failureRate: number;
}
export interface ProvisionDay {
  day: string;
  ready: number;
  failed: number;
}
export interface OpsEventRow {
  id: number;
  at: string;
  level: string;
  event: string;
  errorClass: string | null;
  message: string | null;
  requestId: string | null;
  taskId: string | null;
  user: string | null;
}

const dayOf = (iso: string) => iso.slice(0, 10);

function lastDays(days: number): string[] {
  const out: string[] = [];
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  for (let i = days - 1; i >= 0; i--) out.push(new Date(today - i * 86400_000).toISOString().slice(0, 10));
  return out;
}

async function column(table: string, col: string, sinceIso: string, extra = ""): Promise<Record<string, unknown>[]> {
  const { data, error } = await db()
    .from(table)
    .select(extra ? `${col},${extra}` : col)
    .gte(col, sinceIso)
    .order(col, { ascending: true })
    .limit(10000);
  if (error) fail(`read ${table}`, error);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export async function signupsByDay(days = 30): Promise<DayCount[]> {
  const since = lastDays(days)[0];
  const rows = await column("accounts", "created_at", since);
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(dayOf(String(r.created_at)), (counts.get(dayOf(String(r.created_at))) ?? 0) + 1);
  return lastDays(days).map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

export async function tasksByDay(days = 30): Promise<TaskDay[]> {
  const since = lastDays(days)[0];
  const rows = await column("tasks", "created_at", since, "status");
  const map = new Map<string, TaskDay>();
  for (const day of lastDays(days)) map.set(day, { day, total: 0, failed: 0, stopped: 0, failureRate: 0 });
  for (const r of rows) {
    const d = map.get(dayOf(String(r.created_at)));
    if (!d) continue;
    d.total++;
    if (r.status === "error") d.failed++;
    if (r.status === "stopped") d.stopped++;
  }
  return [...map.values()].map((d) => ({ ...d, failureRate: d.total ? Math.round((d.failed / d.total) * 1000) / 1000 : 0 }));
}

/**
 * Provisioning outcomes per day: "ready" from accounts whose setup finished that day (`setup_at`) plus
 * `provision.ready` events, "failed" from `provision.failed` events (written once the provisioning owner adds the
 * log calls listed in docs/OPERATIONS.md, "Logging").
 */
export async function provisioningByDay(days = 30): Promise<ProvisionDay[]> {
  const since = lastDays(days)[0];
  const [accounts, events] = await Promise.all([column("accounts", "setup_at", since), column("ops_events", "at", since, "event")]);
  const map = new Map<string, ProvisionDay>();
  for (const day of lastDays(days)) map.set(day, { day, ready: 0, failed: 0 });
  const readyFromEvents = new Set<string>();
  for (const e of events) {
    const d = map.get(dayOf(String(e.at)));
    if (!d) continue;
    if (e.event === "provision.failed") d.failed++;
    if (e.event === "provision.ready") {
      d.ready++;
      readyFromEvents.add(d.day);
    }
  }
  for (const a of accounts) {
    const d = map.get(dayOf(String(a.setup_at)));
    if (d && !readyFromEvents.has(d.day)) d.ready++;
  }
  return [...map.values()];
}

export async function recentErrors(limit = 50): Promise<OpsEventRow[]> {
  const { data, error } = await db().from("ops_events").select("id,at,level,event,error_class,message,request_id,task_id,user_hash").order("at", { ascending: false }).limit(limit);
  if (error) fail("read ops events", error);
  return ((data ?? []) as { id: number; at: string; level: string; event: string; error_class: string | null; message: string | null; request_id: string | null; task_id: string | null; user_hash: string | null }[]).map((r) => ({
    id: r.id,
    at: r.at,
    level: r.level,
    event: r.event,
    errorClass: r.error_class,
    message: r.message,
    requestId: r.request_id,
    taskId: r.task_id,
    user: r.user_hash,
  }));
}

export async function totals(): Promise<{ accounts: number | null; tasks: number | null; automations: number | null }> {
  const c = async (t: string) => {
    const { count, error } = await db().from(t).select("*", { count: "exact", head: true });
    return error ? null : (count ?? 0);
  };
  const [accounts, tasks, automations] = await Promise.all([c("accounts"), c("tasks"), c("automations")]);
  return { accounts, tasks, automations };
}

/** Deletes operator events older than `days` (the tick calls this; the table is a 30-day log). */
export async function pruneOpsEvents(days = 30): Promise<void> {
  await db().from("ops_events").delete().lt("at", new Date(Date.now() - days * 86400_000).toISOString());
}
