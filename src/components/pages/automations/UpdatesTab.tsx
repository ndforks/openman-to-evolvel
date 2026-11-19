// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Updates: every run grouped by day with status and result summary, or a month calendar. */
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleSlash, Clock3, List, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutomationView, RunView } from "@/lib/automations/types";
import { cx } from "../cx";
import { taskHref } from "../routes";
import { automationsApi, localTimeZone } from "./api";

const TRIGGER_LABEL: Record<RunView["trigger"], string> = { schedule: "Scheduled", webhook: "Webhook", rss: "RSS", email: "Email", app: "App event", test: "Test run", retry: "Retry" };

export function StatusIcon({ status, size = 16 }: { status: RunView["status"]; size?: number }) {
  if (status === "completed") return <CheckCircle2 size={size} strokeWidth={1.8} className="text-[var(--om-success,#25BA3B)]" aria-label="Completed" />;
  if (status === "failed") return <XCircle size={size} strokeWidth={1.8} className="text-[var(--om-danger)]" aria-label="Failed" />;
  if (status === "stopped") return <CircleSlash size={size} strokeWidth={1.8} className="text-[var(--om-icon-3,#7A7A7A)]" aria-label="Stopped" />;
  if (status === "queued") return <Clock3 size={size} strokeWidth={1.8} className="text-[var(--om-icon-2)]" aria-label="Retry queued" />;
  return <Loader2 size={size} strokeWidth={1.8} className="animate-spin text-[var(--om-text-accent)]" aria-label="Running" />;
}

const STATUS_TEXT: Record<RunView["status"], string> = { completed: "Completed", failed: "Failed", stopped: "Stopped", queued: "Retry queued", running: "Running" };

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function dayTitle(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function RunRow({ run }: { run: RunView }) {
  const body = (
    <div className="flex gap-[12px] rounded-[12px] px-[14px] py-[12px] transition-colors hover:bg-[var(--om-fill-subtle)]">
      <span className="pt-[2px]">
        <StatusIcon status={run.status} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex items-center gap-[8px] text-[14px] leading-[20px]">
          <span className="truncate font-medium text-[var(--om-text-1)]">{run.automationName}</span>
          <span className="shrink-0 text-[13px] text-[var(--om-text-3)]">
            {timeOf(run.startedAt)} · {TRIGGER_LABEL[run.trigger]}
            {run.attempt > 1 ? ` · attempt ${run.attempt}` : ""} · {STATUS_TEXT[run.status]}
          </span>
        </div>
        {run.summary || run.error ? (
          <p className={cx("line-clamp-2 text-[13px] leading-[19px]", run.status === "failed" && !run.summary ? "text-[var(--om-danger)]" : "text-[var(--om-text-2)]")}>
            {run.status === "failed" && run.error ? run.error : run.summary}
          </p>
        ) : run.status === "running" ? (
          <p className="text-[13px] leading-[19px] text-[var(--om-text-3)]">Working on it…</p>
        ) : null}
      </div>
    </div>
  );
  return run.taskId ? (
    <Link href={taskHref(run.taskId)} className="block outline-none focus-visible:ring-1 focus-visible:ring-[var(--om-border-focus)] rounded-[12px]">
      {body}
    </Link>
  ) : (
    body
  );
}

function RunList({ runs }: { runs: RunView[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, RunView[]>();
    for (const r of runs) {
      const k = dayKey(r.startedAt);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [runs]);
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-[6px] rounded-[14px] border border-dashed border-[var(--om-border)] py-[48px] text-center">
        <span className="text-[15px] font-medium text-[var(--om-text-1)]">No runs yet</span>
        <span className="text-[13px] text-[var(--om-text-3)]">Runs show here with their status and a summary of the result. Use Test run on a card to try one now.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[18px]">
      {groups.map(([key, list]) => (
        <section key={key} className="flex flex-col">
          <h3 className="px-[14px] pb-[4px] text-[13px] font-medium leading-[18px] text-[var(--om-text-3)]">{dayTitle(key)}</h3>
          {list.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ calendar

type CalDay = { date: string; runs: RunView[]; upcoming: { automationId: string; name: string; at: string }[] };
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthCalendar() {
  const tz = localTimeZone();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [days, setDays] = useState<Map<string, CalDay>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const month = `${cursor.y}-${String(cursor.m).padStart(2, "0")}`;

  useEffect(() => {
    let live = true;
    automationsApi
      .calendar(month, tz)
      .then((r) => live && setDays(new Map(r.days.map((d) => [d.date, d]))))
      .catch(() => live && setDays(new Map()));
    return () => {
      live = false;
    };
  }, [month, tz]);

  const first = new Date(cursor.y, cursor.m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(cursor.y, cursor.m, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + count) / 7) * 7 }, (_, i) => i - lead + 1);
  const todayKey = dayKey(now.toISOString());
  const shift = (n: number) => setCursor(({ y, m }) => ({ y: m + n > 12 ? y + 1 : m + n < 1 ? y - 1 : y, m: ((m + n + 11) % 12) + 1 }));
  const openDay = open ? days.get(open) : null;

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px]">
        <span className="text-[16px] font-medium">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() + 1 })} className="h-[28px] cursor-pointer rounded-[8px] border border-[var(--om-border)] px-[10px] text-[13px] hover:bg-[var(--om-fill-subtle)]">
          Today
        </button>
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-[8px] hover:bg-[var(--om-fill)]">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-[8px] hover:bg-[var(--om-fill)]">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-[12px] border border-[var(--om-border)]">
        {WEEK.map((w) => (
          <div key={w} className="border-b border-[var(--om-border)] px-[8px] py-[6px] text-[12px] text-[var(--om-text-3)]">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d >= 1 && d <= count;
          const key = inMonth ? `${month}-${String(d).padStart(2, "0")}` : "";
          const day = inMonth ? days.get(key) : undefined;
          const items = [...(day?.runs.map((r) => ({ id: r.id, label: r.automationName ?? "", status: r.status as RunView["status"] | "upcoming", at: r.startedAt })) ?? []), ...(day?.upcoming.map((u) => ({ id: `${u.automationId}-${u.at}`, label: u.name, status: "upcoming" as const, at: u.at })) ?? [])];
          return (
            <button
              type="button"
              key={i}
              disabled={!inMonth || items.length === 0}
              onClick={() => setOpen(key)}
              className={cx("flex h-[104px] min-w-0 flex-col gap-[3px] border-[var(--om-border)] p-[6px] text-left", i % 7 !== 6 && "border-r", i < cells.length - 7 && "border-b", inMonth && items.length ? "cursor-pointer hover:bg-[var(--om-fill-subtle)]" : "cursor-default")}
            >
              {inMonth ? (
                <span className={cx("flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px]", key === todayKey ? "bg-[var(--om-btn-primary)] font-medium text-[var(--om-text-inverse)]" : "text-[var(--om-text-2)]")}>{d}</span>
              ) : null}
              {items.slice(0, 3).map((it) => (
                <span key={it.id} className="flex min-w-0 items-center gap-[4px] text-[12px] leading-[16px] text-[var(--om-text-2)]">
                  {it.status === "upcoming" ? <Clock3 size={11} strokeWidth={1.8} className="shrink-0 text-[var(--om-icon-3,#7A7A7A)]" aria-hidden /> : <StatusIcon status={it.status} size={11} />}
                  <span className="truncate">{it.label}</span>
                </span>
              ))}
              {items.length > 3 ? <span className="text-[11px] text-[var(--om-text-3)]">{items.length - 3} more</span> : null}
            </button>
          );
        })}
      </div>
      {openDay ? (
        <div className="flex flex-col gap-[4px] rounded-[12px] border border-[var(--om-border)] py-[8px]">
          <div className="flex items-center justify-between px-[14px] pb-[4px]">
            <span className="text-[13px] font-medium">{dayTitle(openDay.date)}</span>
            <button type="button" onClick={() => setOpen(null)} className="cursor-pointer text-[13px] text-[var(--om-text-3)] hover:text-[var(--om-text-1)]">
              Close
            </button>
          </div>
          {openDay.runs.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
          {openDay.upcoming.map((u) => (
            <div key={`${u.automationId}-${u.at}`} className="flex items-center gap-[12px] px-[14px] py-[8px] text-[13px] text-[var(--om-text-2)]">
              <Clock3 size={16} strokeWidth={1.8} aria-hidden />
              <span className="font-medium text-[var(--om-text-1)]">{u.name}</span>
              <span className="text-[var(--om-text-3)]">Scheduled · {timeOf(u.at)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UpdatesTab({ automations }: { automations: AutomationView[] }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [runs, setRuns] = useState<RunView[] | null>(null);
  const load = useCallback(async () => {
    try {
      setRuns((await automationsApi.runs({ limit: 200 })).runs);
    } catch {
      setRuns((r) => r ?? []);
    }
  }, []);
  const stamp = automations.map((a) => a.lastRun?.id ?? "").join();
  useEffect(() => {
    let live = true;
    automationsApi
      .runs({ limit: 200 })
      .then((r) => live && setRuns(r.runs))
      .catch(() => live && setRuns((r) => r ?? []));
    return () => {
      live = false;
    };
  }, [stamp]);
  useEffect(() => {
    if (!runs?.some((r) => r.status === "running" || r.status === "queued")) return;
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [runs, load]);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex justify-end">
        <div className="flex rounded-[9px] border border-[var(--om-border)] p-[2px]" role="group" aria-label="Updates view">
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={v === "list" ? "List" : "Calendar"}
              onClick={() => setView(v)}
              className={cx("flex h-[26px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] outline-none", view === v ? "bg-[var(--om-fill-strong)] text-[var(--om-icon-1)]" : "text-[var(--om-icon-2)] hover:text-[var(--om-icon-1)]")}
            >
              {v === "list" ? <List size={15} strokeWidth={1.8} aria-hidden /> : <CalendarDays size={15} strokeWidth={1.8} aria-hidden />}
            </button>
          ))}
        </div>
      </div>
      {view === "calendar" ? <MonthCalendar /> : runs === null ? <div className="h-[120px] animate-pulse rounded-[12px] bg-[var(--om-fill-subtle)]" /> : <RunList runs={runs} />}
    </div>
  );
}
