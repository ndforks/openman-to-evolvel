/** Read models for the Updates tab: runs with names, and a month calendar with upcoming runs. */
import { getRun, listAutomations, listRuns, type RunRecord } from "@/lib/db/automations";
import { checkRun, timeRules } from "./engine";
import { runsBetween, wallClock, zonedToUtc, isValidTimeZone } from "./schedule";
import { toRunView } from "./service";
import type { RunView } from "./types";

/** Brings running runs up to date (finishes the ones whose task is done) before they are shown. */
export async function refreshRuns(runs: RunRecord[]): Promise<RunRecord[]> {
  return Promise.all(
    runs.map(async (r) => {
      if (r.status !== "running") return r;
      try {
        const status = await checkRun(r);
        if (status === "running") return r;
        return (await getRun(r.userId, r.id)) ?? r;
      } catch {
        return r;
      }
    }),
  );
}

export async function runsWithNames(userId: string, opts: { from?: string; to?: string; limit?: number }): Promise<RunView[]> {
  const [runs, automations] = await Promise.all([listRuns(userId, opts), listAutomations(userId)]);
  const names = new Map(automations.map((a) => [a.id, a.name]));
  const fresh = await refreshRuns(runs);
  return fresh.map((r) => toRunView(r, names.get(r.automationId) ?? "Deleted automation"));
}

export interface CalendarDay {
  date: string;
  runs: RunView[];
  upcoming: { automationId: string; name: string; at: string }[];
}

const ymd = (ms: number, tz: string) => {
  const w = wallClock(ms, tz);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
};

/** Runs and upcoming scheduled runs for every local day of `month` (YYYY-MM) in `tz`. */
export async function calendarMonth(userId: string, month: string, tzRaw: string): Promise<{ month: string; timezone: string; days: CalendarDay[] }> {
  const tz = isValidTimeZone(tzRaw) ? tzRaw : "UTC";
  const [y, m] = month.split("-").map(Number);
  const from = zonedToUtc(y, m, 1, 0, 0, tz);
  const to = zonedToUtc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0, tz);
  const [runs, automations] = await Promise.all([listRuns(userId, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), limit: 1000 }), listAutomations(userId)]);
  const names = new Map(automations.map((a) => [a.id, a.name]));
  const days = new Map<string, CalendarDay>();
  const day = (key: string) => {
    let d = days.get(key);
    if (!d) days.set(key, (d = { date: key, runs: [], upcoming: [] }));
    return d;
  };
  for (const r of runs) day(ymd(Date.parse(r.startedAt), tz)).runs.push(toRunView(r, names.get(r.automationId) ?? "Deleted automation"));
  const now = Date.now();
  for (const a of automations) {
    if (!a.enabled) continue;
    const endsAtMs = a.endsAt ? Date.parse(a.endsAt) : null;
    for (const rule of timeRules(a)) {
      // Intervals would flood the calendar; only their next run is shown.
      const cap = rule.freq === "interval" ? 1 : 62;
      for (const at of runsBetween(rule, a.timezone, Math.max(from, now), to, { endsAtMs, anchorMs: Date.parse(a.createdAt), cap })) {
        day(ymd(at, tz)).upcoming.push({ automationId: a.id, name: a.name, at: new Date(at).toISOString() });
      }
    }
  }
  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sorted) d.upcoming.sort((a, b) => a.at.localeCompare(b.at));
  return { month, timezone: tz, days: sorted };
}
