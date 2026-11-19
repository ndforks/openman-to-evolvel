"use client";

/**
 * The work log inside an agent turn: groups of tool calls with a one-line summary ("Looked up 2 queries"),
 * one row per call (icon, action, target), the live row for the call in progress, and plan step markers.
 */
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { LiveDot, MiddleTruncate, Spinner, ThinkDot, formatClock } from "./parts";
import type { PlanStep, StepStatus, ToolCall } from "./reducer";
import { ToolIcon, describeCall, finishedLabel, summarizeCalls } from "./tools";

const ROW = "flex h-6 w-full min-w-0 cursor-pointer items-center gap-[6px] rounded-[6px] text-left text-[14px] leading-5 outline-none";

function ToolRow({ call, selected, onOpen }: { call: ToolCall; selected: boolean; onOpen: (callId: string) => void }) {
  const failed = call.state === "error";
  return (
    <button
      type="button"
      onClick={() => onOpen(call.callId)}
      title={finishedLabel(call)}
      className={cn(ROW, "tv-fade-in text-[var(--om-text-3)] transition-colors hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-1)]", selected && "text-[var(--om-text-2)]")}
    >
      <span className={cn("flex size-4 shrink-0 items-center justify-center", failed && "text-[var(--om-danger)]")}>
        <ToolIcon tool={call.tool} />
      </span>
      <MiddleTruncate text={finishedLabel(call)} />
      {failed ? <span className="shrink-0 text-[12px] leading-4 text-[var(--om-danger)]">Failed</span> : null}
    </button>
  );
}

/** The call in progress: blue dot and a sentence with a shimmer sweep, e.g. "Looking up agent frameworks". */
function LiveRow({ call, onOpen }: { call: ToolCall; onOpen: (callId: string) => void }) {
  const info = describeCall(call);
  return (
    <button type="button" onClick={() => onOpen(call.callId)} className={cn(ROW, "tv-fade-in")}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <LiveDot size={11} />
      </span>
      <span className="tv-shimmer min-w-0 truncate">
        {info.verb}
        {info.verb && info.target ? " " : ""}
        {info.target}
      </span>
    </button>
  );
}

/** Shown under the last block while the agent is between actions. */
export function ThinkingRow() {
  return (
    <div className="tv-fade-in flex h-6 items-center gap-[6px] text-[14px] leading-5" role="status">
      <span className="flex size-4 shrink-0 items-center justify-center">
        <ThinkDot size={11} />
      </span>
      <span className="tv-shimmer">Thinking</span>
    </div>
  );
}

export interface WorkGroupProps {
  calls: ToolCall[];
  at: string;
  /** True for the newest group of a turn that is still running: it previews its latest row. */
  live: boolean;
  /** Call currently shown in the computer panel, if any. */
  selectedCallId?: string | null;
  onOpenCall: (callId: string) => void;
}

export function WorkGroup({ calls, at, live, selectedCallId, onOpenCall }: WorkGroupProps) {
  // null: not touched by the user, so the group follows its default (preview while live, closed after).
  const [open, setOpen] = useState<boolean | null>(null);
  if (calls.length === 0) return null;

  const expanded = open === true;
  const preview = open === null && live;
  const running = calls.filter((c) => c.state === "running");
  const finished = calls.filter((c) => c.state !== "running");
  const visible = expanded ? finished : preview ? finished.slice(-1) : [];
  const liveRows = expanded || preview ? running : [];

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className="group/log flex h-5 w-full min-w-0 cursor-pointer items-center gap-1 text-left text-[14px] leading-5 text-[var(--om-text-3)] outline-none transition-colors hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-2)]"
      >
        <span className="min-w-0 truncate">{summarizeCalls(calls)}</span>
        {expanded ? (
          <ChevronDownIcon size={14} className="shrink-0" />
        ) : (
          <ChevronRightIcon size={14} className={cn("shrink-0", !preview && "opacity-0 transition-opacity group-hover/log:opacity-100 group-focus-visible/log:opacity-100")} />
        )}
        <span className="ms-auto shrink-0 ps-3 text-[13px] leading-[18px] opacity-0 transition-opacity group-hover/log:opacity-100">{formatClock(at)}</span>
      </button>
      {visible.map((call) => (
        <ToolRow key={call.callId} call={call} selected={selectedCallId === call.callId} onOpen={onOpenCall} />
      ))}
      {liveRows.map((call) => (
        <LiveRow key={call.callId} call={call} onOpen={onOpenCall} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- plan steps */

export function StepIcon({ status, size = 16 }: { status: StepStatus | "stopped"; size?: number }) {
  if (status === "active") return <Spinner size={size - 2} />;
  if (status === "done") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-[var(--om-icon-3)]">
        <circle cx="8" cy="8" r="6.5" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeOpacity="0.5" />
        <path d="m5.2 8.2 1.9 1.9 3.7-3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-[var(--om-icon-disabled)]">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeDasharray={status === "stopped" ? undefined : "2.4 2.4"} />
    </svg>
  );
}

/** Marker in the work log where a plan step started. Its state follows the live plan. */
export function StepMarker({ title, plan, turnEnded }: { title: string; plan: PlanStep[]; turnEnded: boolean }) {
  const step = plan.find((s) => s.title === title);
  // A step the plan no longer lists was replaced by a later plan, so it is behind us.
  const status: StepStatus | "stopped" = !step ? "done" : step.status === "active" && turnEnded ? "stopped" : step.status;
  return (
    <div className="tv-fade-in flex min-h-6 items-center gap-[6px] pt-1 text-[14px] font-medium leading-5 text-[var(--om-text-2)]">
      <span className="flex size-4 shrink-0 items-center justify-center">
        <StepIcon status={status} />
      </span>
      <span className="min-w-0 truncate">{title}</span>
    </div>
  );
}

/** The whole plan as a checklist; opens from the status strip. */
export function PlanList({ plan, className }: { plan: PlanStep[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {plan.map((step, i) => (
        <li key={`${i}-${step.title}`} className="flex min-h-8 items-start gap-2 px-3 py-[6px] text-[14px] leading-5">
          <span className="flex h-5 w-4 shrink-0 items-center justify-center">
            <StepIcon status={step.status} />
          </span>
          <span className={cn("min-w-0 break-words", step.status === "pending" ? "text-[var(--om-text-3)]" : step.status === "active" ? "font-medium text-[var(--om-text-1)]" : "text-[var(--om-text-2)]")}>{step.title}</span>
        </li>
      ))}
    </ol>
  );
}
