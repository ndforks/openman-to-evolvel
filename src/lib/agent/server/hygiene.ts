/**
 * The daily sweep of idle task folders on users' home computers (see `src/lib/limits/workspace.ts`). For each user
 * with a home computer: tasks idle longer than the limit, not running, not on another computer and not already swept
 * get their files copied into the server's cache, then their folder (`~/tasks/<id>`) and upload folders removed, and
 * `meta.sweptAt` set; the relay restores the files on the task's next run. A task whose files could not all be
 * cached is left alone.
 *
 * Call `sweepIdleWorkspaces()` from the scheduler tick (it returns at once unless a day has passed).
 */
import { db } from "@/lib/db/client";
import { listTaskRows, updateTaskRow } from "@/lib/db/tasks";
import { idleDays, SWEEP_EVERY_MS, SWEEP_MAX_FILE_BYTES, SWEEP_MAX_TASKS_PER_USER } from "@/lib/limits/workspace";
import type { TaskRecord } from "@/lib/store/types";
import { computerFor, orgoClientFor, primeConnectionFor } from "./connection";
import { ensureCached } from "./files";
import { isActiveStatus } from "./relay";
import { forgetTaskFolder, remoteComputerId } from "./remote";
import { ext } from "./task-meta";
import { sweepScript } from "./workspace";

const g = globalThis as typeof globalThis & { __omLastSweep?: number; __omSweeping?: Promise<SweepResult> | null };

export interface SweepResult {
  ran: boolean;
  users: number;
  swept: number;
  kept: number;
  errors: string[];
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Tasks of one user whose folder is due for removal at `now`. */
export function dueForSweep(tasks: TaskRecord[], now: number, days = idleDays()): TaskRecord[] {
  const cutoff = now - days * 24 * 60 * 60_000;
  return tasks.filter((t) => {
    const m = ext(t.meta);
    if (m.sweptAt || isActiveStatus(t.status) || m.queued || remoteComputerId(m.target)) return false;
    if (!m.turns && !m.lastRunAt) return false; // never ran: no folder
    const last = Date.parse(m.lastRunAt ?? t.updatedAt);
    return Number.isFinite(last) && last < cutoff;
  });
}

/** Sweeps one user's home computer. `only` limits it to those task ids (tests and support). */
export async function sweepUser(userId: string, now = Date.now(), days = idleDays(), only?: string[]): Promise<{ swept: string[]; kept: string[] }> {
  await primeConnectionFor(userId);
  const orgo = orgoClientFor(userId);
  const home = computerFor(userId)?.computerId;
  if (!orgo || !home) return { swept: [], kept: [] };
  const due = dueForSweep(await listTaskRows(userId, { archived: "all" }), now, days)
    .filter((t) => !only || only.includes(t.id))
    .slice(0, SWEEP_MAX_TASKS_PER_USER);
  const ready: TaskRecord[] = [];
  const kept: string[] = [];
  for (const t of due) {
    const files = Object.values(t.meta.files ?? {});
    let ok = true;
    for (const f of files) {
      if ((f.size ?? 0) > SWEEP_MAX_FILE_BYTES || !(await ensureCached(t.id, f, userId, t.meta.target))) {
        ok = false;
        break;
      }
    }
    if (ok) ready.push(t);
    else kept.push(t.id);
  }
  if (!ready.length) return { swept: [], kept };
  const uploads = ready.flatMap((t) => Object.values(t.meta.files ?? {}).map((f) => /^(\/root\/uploads\/[a-f0-9]{24})\//.exec(f.path)?.[1] ?? "")).filter(Boolean);
  const out = await orgo.bash(home, sweepScript(ready.map((t) => t.id), [...new Set(uploads)]), 120);
  if (!/OM_SWEPT \d+/.test(out.output)) throw new Error("the sweep did not finish on the computer");
  const at = new Date(now).toISOString();
  for (const t of ready) forgetTaskFolder(t.id);
  for (const t of ready) await updateTaskRow(userId, t.id, { meta: { ...t.meta, sweptAt: at } as TaskRecord["meta"] });
  return { swept: ready.map((t) => t.id), kept };
}

/** One pass over every user with a home computer, at most once a day (`force` skips that check). */
export async function sweepIdleWorkspaces(opts: { force?: boolean; now?: number } = {}): Promise<SweepResult> {
  const now = opts.now ?? Date.now();
  if (!opts.force && g.__omLastSweep && now - g.__omLastSweep < SWEEP_EVERY_MS) return { ran: false, users: 0, swept: 0, kept: 0, errors: [] };
  if (g.__omSweeping) return g.__omSweeping;
  g.__omLastSweep = now;
  g.__omSweeping = (async () => {
    const result: SweepResult = { ran: true, users: 0, swept: 0, kept: 0, errors: [] };
    const { data, error } = await db().from("accounts").select("user_id").not("home_computer_id", "is", null).limit(5000);
    if (error) throw new Error(`could not list accounts: ${error.message}`);
    for (const { user_id } of data as { user_id: string }[]) {
      try {
        const r = await sweepUser(user_id, now);
        result.users++;
        result.swept += r.swept.length;
        result.kept += r.kept.length;
      } catch (err) {
        result.errors.push(`${user_id.slice(0, 8)}: ${errorText(err)}`);
      }
    }
    if (result.swept) console.info(`[hygiene] removed ${result.swept} idle task folders (${result.users} users)`);
    return result;
  })().finally(() => {
    g.__omSweeping = null;
  });
  return g.__omSweeping;
}
