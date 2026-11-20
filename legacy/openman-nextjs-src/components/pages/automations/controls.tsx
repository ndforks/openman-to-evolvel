// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Small controls shared by the automation editors: frequency and time pills, day chips, settings menu. */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Bot, Calendar, Check, ChevronDown, ChevronRight, Clock, FolderClosed, Globe, ListChecks, Plug, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { brand, type ModeId } from "@/config/brand";
import { WEEKDAY_SHORT, type RepeatRule } from "@/lib/automations/types";
import { cx } from "../cx";
import { MENU_SURFACE } from "../ui";

export const PILL =
  "inline-flex h-[28px] cursor-pointer items-center gap-[4px] rounded-[8px] bg-[var(--om-fill)] px-[8px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-strong)] data-[state=open]:bg-[var(--om-fill-strong)]";
const ITEM = "flex h-[34px] cursor-pointer select-none items-center justify-between gap-[10px] rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]";

export type Freq = "daily" | "weekdays" | "weekly" | "monthly" | "once" | "interval";
const FREQ_LABEL: Record<Freq, string> = { daily: "Daily", weekdays: "Every weekday", weekly: "Weekly", monthly: "Monthly", once: "Just once", interval: "Every few minutes" };
const FREQ_ORDER: Freq[] = ["daily", "weekdays", "weekly", "monthly", "once", "interval"];

/** "10:00 AM": a 24-hour "HH:MM" as a 12-hour label. */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function todayIn(tz: string, addDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + addDays * 86_400_000));
}

/** Changes a rule's frequency, keeping its time. */
export function withFreq(rule: RepeatRule, freq: Freq, tz: string): RepeatRule {
  const time = "time" in rule ? rule.time : "09:00";
  switch (freq) {
    case "daily":
      return { freq, time };
    case "weekdays":
      return { freq, time };
    case "weekly":
      return { freq, days: rule.freq === "weekly" ? rule.days : [1], time };
    case "monthly":
      return { freq, dates: rule.freq === "monthly" ? rule.dates : [1], time };
    case "once":
      return { freq, date: rule.freq === "once" ? rule.date : todayIn(tz, 1), time };
    case "interval":
      return { freq, everyMinutes: rule.freq === "interval" ? rule.everyMinutes : 60 };
  }
}

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

function TimePill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={PILL} aria-label="Time">
        {timeLabel(value)}
        <ChevronDown size={14} strokeWidth={2} className="text-[var(--om-icon-2)]" aria-hidden />
      </Popover.Trigger>
      <Popover.Content align="start" sideOffset={6} collisionPadding={8} className={cx(MENU_SURFACE, "w-[200px]")}>
        <label className="flex items-center gap-[8px] px-[10px] pb-[6px] pt-[4px] text-[12px] text-[var(--om-text-3)]">
          Exact time
          <input
            type="time"
            value={value}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="h-[28px] flex-1 rounded-[7px] border border-[var(--om-border-strong)] bg-transparent px-[6px] text-[13px] text-[var(--om-text-1)] outline-none [color-scheme:dark] focus:border-[var(--om-border-focus)]"
          />
        </label>
        <div className="max-h-[240px] overflow-y-auto">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              ref={(el) => {
                if (el && t === value) el.scrollIntoView({ block: "center" });
              }}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={cx(ITEM, "w-full hover:bg-[var(--om-fill)]")}
            >
              {timeLabel(t)}
              {t === value ? <Check size={16} strokeWidth={2} aria-hidden /> : null}
            </button>
          ))}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function FreqPill({ value, onChange, allowInterval }: { value: Freq; onChange: (f: Freq) => void; allowInterval?: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={PILL} aria-label="Repeat">
        {FREQ_LABEL[value]}
        <ChevronDown size={14} strokeWidth={2} className="text-[var(--om-icon-2)]" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" sideOffset={6} collisionPadding={8} className={cx(MENU_SURFACE, "w-[210px]")}>
        {FREQ_ORDER.filter((f) => f !== "interval" || allowInterval).map((f) => (
          <DropdownMenu.Item key={f} onSelect={() => onChange(f)} className={ITEM}>
            {FREQ_LABEL[f]}
            {f === value ? <Check size={16} strokeWidth={2} aria-hidden /> : null}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The "Daily at AM 10:00" row, with the extra pickers each frequency needs. */
export function RuleRow({ rule, onChange, timezone, minInterval = 5, allowInterval = false }: { rule: RepeatRule; onChange: (r: RepeatRule) => void; timezone: string; minInterval?: number; allowInterval?: boolean }) {
  return (
    <div className="flex flex-col gap-[10px] rounded-[12px] border border-[var(--om-border)] px-[15px] py-[11px]">
      <div className="flex flex-wrap items-center gap-[8px] text-[14px] leading-[20px] text-[var(--om-text-2)]">
        <Clock size={17} strokeWidth={1.8} className="mr-[2px] text-[var(--om-icon-1)]" aria-hidden />
        <FreqPill value={rule.freq} onChange={(f) => onChange(withFreq(rule, f, timezone))} allowInterval={allowInterval || rule.freq === "interval"} />
        {rule.freq === "interval" ? (
          <>
            <span>every</span>
            <input
              type="number"
              min={minInterval}
              step={5}
              value={rule.everyMinutes}
              onChange={(e) => onChange({ freq: "interval", everyMinutes: Math.max(1, Number(e.target.value) || minInterval) })}
              className="h-[28px] w-[64px] rounded-[8px] bg-[var(--om-fill)] px-[8px] text-[14px] text-[var(--om-text-1)] outline-none [color-scheme:dark]"
            />
            <span>minutes</span>
          </>
        ) : (
          <>
            {rule.freq === "once" ? (
              <>
                <span>on</span>
                <input
                  type="date"
                  value={rule.date}
                  min={todayIn(timezone)}
                  onChange={(e) => e.target.value && onChange({ ...rule, date: e.target.value })}
                  className="h-[28px] rounded-[8px] bg-[var(--om-fill)] px-[8px] text-[14px] text-[var(--om-text-1)] outline-none [color-scheme:dark]"
                />
              </>
            ) : null}
            <span>at</span>
            <TimePill value={rule.time} onChange={(time) => onChange({ ...rule, time })} />
          </>
        )}
      </div>
      {rule.freq === "weekly" ? (
        <div className="flex flex-wrap gap-[6px] pl-[27px]" role="group" aria-label="Days of the week">
          {DAY_ORDER.map((d) => {
            const on = rule.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const days = on ? rule.days.filter((x) => x !== d) : [...rule.days, d];
                  if (days.length) onChange({ ...rule, days });
                }}
                className={cx(
                  "h-[28px] min-w-[44px] cursor-pointer rounded-[8px] px-[8px] text-[13px] leading-[18px] outline-none transition-colors",
                  on ? "bg-[var(--om-btn-primary)] font-medium text-[var(--om-text-inverse)]" : "bg-[var(--om-fill)] text-[var(--om-text-2)] hover:bg-[var(--om-fill-strong)]",
                )}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            );
          })}
        </div>
      ) : null}
      {rule.freq === "monthly" ? (
        <div className="grid w-fit grid-cols-7 gap-[4px] pl-[27px]" role="group" aria-label="Days of the month">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
            const on = rule.dates.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const dates = on ? rule.dates.filter((x) => x !== d) : [...rule.dates, d];
                  if (dates.length) onChange({ ...rule, dates });
                }}
                className={cx(
                  "h-[28px] w-[34px] cursor-pointer rounded-[8px] text-[13px] leading-[18px] outline-none transition-colors",
                  on ? "bg-[var(--om-btn-primary)] font-medium text-[var(--om-text-inverse)]" : "bg-[var(--om-fill)] text-[var(--om-text-2)] hover:bg-[var(--om-fill-strong)]",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ settings

export interface RunSettings {
  runIn: "new" | "same";
  mode: string;
  projectId: string | null;
  connectors: string[];
  timezone: string;
  endsAt: string | null;
}

interface Project {
  id: string;
  name: string;
}
interface Connector {
  slug: string;
  name: string;
  logo?: string;
  connected?: boolean;
}

function useOptions(): { projects: Project[]; connectors: Connector[] } {
  const [projects, setProjects] = useState<Project[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((b: { projects?: Project[] }) => live && setProjects(b.projects ?? []))
      .catch(() => undefined);
    fetch("/api/connectors")
      .then((r) => (r.ok ? r.json() : { connectors: [] }))
      .then((b: { connectors?: Connector[] }) => live && setConnectors((b.connectors ?? []).filter((c) => c.connected)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return { projects, connectors };
}

const ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["UTC"];
  } catch {
    return ["UTC"];
  }
})();

function Row({ icon, label, value, children }: { icon: ReactNode; label: string; value: string; children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={cx(ITEM, "h-[38px] data-[state=open]:bg-[var(--om-fill)]")}>
        <span className="flex items-center gap-[10px]">
          <span className="flex w-[18px] justify-center text-[var(--om-icon-1)]">{icon}</span>
          {label}
        </span>
        <span className="flex items-center gap-[6px] text-[var(--om-text-3)]">
          <span className="max-w-[150px] truncate">{value}</span>
          <ChevronRight size={15} strokeWidth={2} aria-hidden />
        </span>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={8} collisionPadding={8} className={cx(MENU_SURFACE, "dark max-h-[320px] min-w-[220px] overflow-y-auto")}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

function Choice({ on, label, onSelect }: { on: boolean; label: string; onSelect: () => void }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className={ITEM}>
      {label}
      {on ? <Check size={16} strokeWidth={2} aria-hidden /> : null}
    </DropdownMenu.Item>
  );
}

/** The sliders button under an editor: Run in, Agent, Connectors, Project, Time zone, Expiration date. */
export function SettingsMenu({ value, onChange }: { value: RunSettings; onChange: (v: RunSettings) => void }) {
  const { projects, connectors } = useOptions();
  const set = (patch: Partial<RunSettings>) => onChange({ ...value, ...patch });
  const project = projects.find((p) => p.id === value.projectId);
  const modeLabel = (brand.modes as Record<string, { label: string }>)[value.mode]?.label ?? value.mode;
  const endsDate = value.endsAt ? value.endsAt.slice(0, 10) : "";
  const zones = useMemo(() => (ZONES.includes(value.timezone) ? ZONES : [value.timezone, ...ZONES]), [value.timezone]);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Automation settings"
        className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-full border border-[var(--om-border)] text-[var(--om-icon-1)] outline-none transition-colors hover:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]"
      >
        <SlidersHorizontal size={15} strokeWidth={1.8} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" sideOffset={8} collisionPadding={8} className={cx(MENU_SURFACE, "w-[352px]")}>
        <Row icon={<ListChecks size={16} strokeWidth={1.8} />} label="Run in" value={value.runIn === "same" ? "Same task" : "Separate task"}>
          <Choice on={value.runIn === "new"} label="Separate task" onSelect={() => set({ runIn: "new" })} />
          <Choice on={value.runIn === "same"} label="Same task" onSelect={() => set({ runIn: "same" })} />
          <p className="max-w-[260px] px-[10px] pb-[6px] pt-[4px] text-[12px] leading-[16px] text-[var(--om-text-3)]">
            {value.runIn === "same" ? "Every run picks up in the task the previous run used." : "Every run opens a fresh task."}
          </p>
        </Row>
        <Row icon={<Bot size={16} strokeWidth={1.8} />} label="Agent" value={modeLabel}>
          {(Object.keys(brand.modes) as ModeId[])
            .filter((m) => m !== "flex")
            .map((m) => (
              <Choice key={m} on={value.mode === m} label={brand.modes[m].label} onSelect={() => set({ mode: m })} />
            ))}
        </Row>
        <Row icon={<Plug size={16} strokeWidth={1.8} />} label="Connectors" value={value.connectors.length ? `${value.connectors.length} selected` : "None"}>
          {connectors.length === 0 ? <p className="max-w-[240px] px-[10px] py-[8px] text-[13px] text-[var(--om-text-3)]">Nothing connected yet. Add apps from Plugins first.</p> : null}
          {connectors.map((c) => {
            const on = value.connectors.includes(c.slug);
            return (
              <DropdownMenu.CheckboxItem
                key={c.slug}
                checked={on}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => set({ connectors: on ? value.connectors.filter((s) => s !== c.slug) : [...value.connectors, c.slug] })}
                className={ITEM}
              >
                <span className="flex items-center gap-[8px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.logo ? <img src={c.logo} alt="" width={16} height={16} /> : null}
                  {c.name}
                </span>
                {on ? <Check size={16} strokeWidth={2} aria-hidden /> : null}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </Row>
        <Row icon={<FolderClosed size={16} strokeWidth={1.8} />} label="Project" value={project?.name ?? "None"}>
          <Choice on={!value.projectId} label="None" onSelect={() => set({ projectId: null })} />
          {projects.map((p) => (
            <Choice key={p.id} on={value.projectId === p.id} label={p.name} onSelect={() => set({ projectId: p.id })} />
          ))}
        </Row>
        <Row icon={<Globe size={16} strokeWidth={1.8} />} label="Time zone" value={value.timezone}>
          {zones.map((z) => (
            <Choice key={z} on={value.timezone === z} label={z.replace(/_/g, " ")} onSelect={() => set({ timezone: z })} />
          ))}
        </Row>
        <Row icon={<Calendar size={16} strokeWidth={1.8} />} label="Expiration date" value={endsDate || "None"}>
          <div className="flex flex-col gap-[8px] p-[8px]">
            <span className="text-[12px] text-[var(--om-text-3)]">After this date the automation stops.</span>
            <input
              type="date"
              value={endsDate}
              min={todayIn(value.timezone)}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => set({ endsAt: e.target.value ? new Date(`${e.target.value}T23:59:59Z`).toISOString() : null })}
              className="h-[30px] rounded-[8px] border border-[var(--om-border-strong)] bg-transparent px-[8px] text-[13px] text-[var(--om-text-1)] outline-none [color-scheme:dark]"
            />
          </div>
          <Choice on={!value.endsAt} label="Never" onSelect={() => set({ endsAt: null })} />
        </Row>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
