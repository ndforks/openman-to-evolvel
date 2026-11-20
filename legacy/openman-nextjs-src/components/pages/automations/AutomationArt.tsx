// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Small worked examples on the Automations empty state: what starts the run, then what the agent does. */
import { AlarmClock, Bug, FileText, GitPullRequest, Star } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { brand } from "@/config/brand";
import type { AutomationStart } from "../data/automations";
import { BrandLogo } from "../ui";
import { FlowChevrons } from "./icons";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const noop = () => () => {};
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
};
/** Used on the server and until the browser reports today's date. */
const FALLBACK_DAY = "2026-11-16";

/** Index (0 = Monday) of today within the working week, or -1 at the weekend, and the month-day number. */
function useToday(): { weekday: number; date: number; month: string } {
  const key = useSyncExternalStore(noop, todayKey, () => FALLBACK_DAY);
  const [year, month, day] = key.split("-").map(Number);
  const d = new Date(year, month, day);
  const weekday = (d.getDay() + 6) % 7;
  return { weekday: weekday < 5 ? weekday : -1, date: day, month: d.toLocaleString("en-US", { month: "short" }) };
}

function MiniCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`flex w-[212px] shrink-0 flex-col rounded-[12px] border border-white/[0.06] bg-[#202020] shadow-[0_4px_12px_#00000040] ${className ?? ""}`}>{children}</div>;
}

function AgentLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-[6px]">
      <BrandLogo src={brand.logoMark} w={14} h={14} />
      <div className="min-w-0 text-[11.5px] leading-[15px] text-[var(--om-text-2)]">{children}</div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <div className="flex h-[20px] shrink-0 items-center gap-[4px] self-start rounded-[6px] bg-[var(--om-fill-strong)] px-[6px] text-[11px] leading-[14px] text-[var(--om-text-2)]">{children}</div>;
}

function ScheduleArt() {
  const today = useToday();
  return (
    <>
      <MiniCard className="gap-[8px] p-[10px]">
        <div className="flex items-center gap-[6px] text-[12px] font-medium leading-[16px] text-[var(--om-text-1)]">
          <AlarmClock size={13} strokeWidth={1.9} className="text-[#f0b35a]" aria-hidden />
          Weekdays at 8:00
        </div>
        <div className="flex gap-[4px]">
          {WEEKDAYS.map((name, i) => (
            <div
              key={name}
              className={
                i === today.weekday
                  ? "flex h-[26px] flex-1 items-center justify-center rounded-[6px] bg-[#f0b35a] text-[10px] font-semibold leading-[12px] text-[#1a1a1a]"
                  : "flex h-[26px] flex-1 items-center justify-center rounded-[6px] bg-[var(--om-fill-strong)] text-[10px] leading-[12px] text-[var(--om-text-2)]"
              }
            >
              {name}
            </div>
          ))}
        </div>
      </MiniCard>
      <FlowChevrons />
      <MiniCard className="gap-[6px] p-[10px]">
        <AgentLine>
          <span className="font-semibold text-[var(--om-text-1)]">8:00 run</span>: reading overnight emails and support tickets…
        </AgentLine>
        <Chip>
          <FileText size={11} strokeWidth={2} className="text-[#7aa7ff]" aria-hidden />
          morning-brief-{today.month.toLowerCase()}-{today.date}.md
        </Chip>
      </MiniCard>
    </>
  );
}

function TriggerArt() {
  return (
    <>
      <MiniCard className="gap-[6px] p-[10px]">
        <div className="flex items-center gap-[6px]">
          <BrandLogo src="/brands/github-c.svg" w={14} h={14} />
          <span className="text-[11px] leading-[14px] text-[var(--om-text-3)]">acme/web</span>
        </div>
        <div className="flex items-center gap-[6px] text-[12px] font-semibold leading-[16px] text-[var(--om-text-1)]">
          <Bug size={13} strokeWidth={1.9} className="text-[#f07a7a]" aria-hidden />
          Issue labelled “bug”
        </div>
      </MiniCard>
      <FlowChevrons />
      <MiniCard className="gap-[6px] p-[10px]">
        <AgentLine>
          <span className="font-semibold text-[var(--om-text-1)]">New bug</span>: reproducing it on a fresh branch…
        </AgentLine>
        <Chip>
          <GitPullRequest size={11} strokeWidth={2} className="text-[#8ad19a]" aria-hidden />
          Draft fix, ready for review
        </Chip>
      </MiniCard>
    </>
  );
}

function AdvancedArt() {
  const steps = ["Watch reviews", "Spot a low score", "Draft a reply", "Tell the team"];
  return (
    <>
      <MiniCard className="gap-[6px] p-[10px]">
        <div className="flex items-center gap-[4px] text-[10px] leading-[12px] text-[var(--om-text-3)]">
          <Star size={10} strokeWidth={2} aria-hidden />
          Your rule
        </div>
        <div className="text-[12px] leading-[15.5px] text-[var(--om-text-1)]">If a review comes in under 3 stars, answer it within the hour and post it in Slack.</div>
      </MiniCard>
      <FlowChevrons />
      <MiniCard className="gap-[6px] p-[10px]">
        <ol className="flex flex-col gap-[4px]">
          {steps.map((step, i) => (
            <li key={step} className="flex items-center gap-[6px] text-[11px] leading-[14px] text-[var(--om-text-2)]">
              <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-[var(--om-fill-strong)] text-[9px] text-[var(--om-text-1)]">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </MiniCard>
    </>
  );
}

export function AutomationArt({ start }: { start: AutomationStart }) {
  return (
    <div aria-hidden className="flex h-[320px] w-full shrink-0 flex-col items-center justify-center gap-[6px] overflow-hidden bg-[var(--om-fill)] px-[16px]">
      {start === "schedule" ? <ScheduleArt /> : start === "trigger" ? <TriggerArt /> : <AdvancedArt />}
    </div>
  );
}
