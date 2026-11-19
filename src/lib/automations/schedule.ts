/**
 * Next-run computation for repeat rules in an IANA time zone, using only `Intl` (no libraries).
 * Wall-clock times that do not exist (a spring-forward gap) move forward by the gap; times that
 * happen twice (fall back) fire on the first one.
 */
import type { RepeatRule } from "./types";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall clock in `tz` at instant `ms`. */
export function wallClock(ms: number, tz: string): WallClock {
  const parts: Record<string, string> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) parts[p.type] = p.value;
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour % 24, minute: +parts.minute, second: +parts.second, weekday: WD[parts.weekday] ?? 0 };
}

/** Offset of `tz` from UTC at instant `ms`, in ms (positive east of Greenwich). */
function offsetAt(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in `tz`. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ms = guess - offsetAt(guess, tz);
  const second = guess - offsetAt(ms, tz);
  if (second !== ms) {
    // Crossing a DST change: prefer the earlier valid instant that maps to the wall time.
    const w = wallClock(second, tz);
    ms = w.hour === hour && w.minute === minute ? Math.min(ms, second) : Math.max(ms, second);
  }
  return ms;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function matchesDay(rule: RepeatRule, y: number, m: number, d: number): boolean {
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  switch (rule.freq) {
    case "daily":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekly":
      return rule.days.includes(weekday);
    case "monthly":
      return rule.dates.includes(d) && d <= daysInMonth(y, m);
    default:
      return false;
  }
}

/**
 * The first run strictly after `afterMs`, or null when the rule has no more runs (a past one-off,
 * or past `endsAtMs`). `anchorMs` aligns interval rules (their first slot).
 */
export function nextRun(rule: RepeatRule, tz: string, afterMs: number, opts: { endsAtMs?: number | null; anchorMs?: number } = {}): number | null {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const ends = opts.endsAtMs ?? null;
  const within = (ms: number | null) => (ms !== null && (ends === null || ms <= ends) ? ms : null);

  if (rule.freq === "interval") {
    const step = rule.everyMinutes * 60_000;
    const anchor = opts.anchorMs ?? afterMs;
    if (anchor > afterMs) return within(anchor);
    const n = Math.floor((afterMs - anchor) / step) + 1;
    return within(anchor + n * step);
  }

  const [hh, mm] = rule.time.split(":").map(Number);
  if (rule.freq === "once") {
    const [y, m, d] = rule.date.split("-").map(Number);
    const ms = zonedToUtc(y, m, d, hh, mm, zone);
    return ms > afterMs ? within(ms) : null;
  }

  const start = wallClock(afterMs, zone);
  // Walk calendar days in the zone; 400 covers every monthly rule (including the 31st).
  let y = start.year;
  let m = start.month;
  let d = start.day;
  for (let i = 0; i < 400; i++) {
    if (matchesDay(rule, y, m, d)) {
      const ms = zonedToUtc(y, m, d, hh, mm, zone);
      if (ms > afterMs) return within(ms);
    }
    d++;
    if (d > daysInMonth(y, m)) {
      d = 1;
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    if (ends !== null && Date.UTC(y, m - 1, d) - 2 * 86_400_000 > ends) return null;
  }
  return null;
}

/** Every run in [fromMs, toMs), capped. Used for the calendar's upcoming runs. */
export function runsBetween(rule: RepeatRule, tz: string, fromMs: number, toMs: number, opts: { endsAtMs?: number | null; anchorMs?: number; cap?: number } = {}): number[] {
  const out: number[] = [];
  const cap = opts.cap ?? 200;
  let cursor = fromMs - 1;
  while (out.length < cap) {
    const next = nextRun(rule, tz, cursor, opts);
    if (next === null || next >= toMs) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

/** Shortest gap between runs, in minutes (for the plan's minimum interval). Infinity for one-offs. */
export function minGapMinutes(rule: RepeatRule): number {
  if (rule.freq === "interval") return rule.everyMinutes;
  if (rule.freq === "once") return Infinity;
  return 24 * 60;
}
