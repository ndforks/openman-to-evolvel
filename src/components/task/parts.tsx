"use client";

/** Small pieces shared by the conversation, the composer and the computer panel. */
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { TaskStatus } from "@/lib/agent/types";

/* ---------------------------------------------------------------- formatting */

/** "8:04 PM" */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "12s", "1m 11s", "2h 5m" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Current time, refreshed every second while `active`. Used by the live elapsed-time counter. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/* ---------------------------------------------------------------- indicators */

/** Blue pulsing dot shown in front of the action in progress. */
export function LiveDot({ size = 12, className }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={cn("tv-live-dot shrink-0", className)} style={{ width: size, height: size }} />;
}

/** Blue shape that morphs between a circle and a rounded square while the agent is thinking. */
export function ThinkDot({ size = 12, className }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={cn("tv-think-dot shrink-0", className)} style={{ width: size, height: size }} />;
}

export function Dots() {
  return (
    <span aria-hidden="true" className="tv-dots">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Ring spinner in the accent colour. */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={cn("tv-spin shrink-0 text-[var(--om-icon-accent)]", className)}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * One line of text that loses its middle, not its end, when it does not fit:
 * "Identify the three most popular open-source AI ag...ories for comparison."
 */
export function MiddleTruncate({ text, tail = 22, className }: { text: string; tail?: number; className?: string }) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= tail * 2) return <span className={cn("block min-w-0 truncate", className)}>{clean}</span>;
  let cut = clean.length - tail;
  // Keep the space with the tail; trailing spaces of the head would collapse.
  while (cut > 0 && clean[cut - 1] === " ") cut -= 1;
  return (
    <span className={cn("flex min-w-0", className)} title={clean}>
      <span className="min-w-0 truncate">{clean.slice(0, cut)}</span>
      <span className="shrink-0 whitespace-pre">{clean.slice(cut)}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- task status */

/** Name of the side panel that streams the agent's screen, and of its main tab. */
export const computerTitle = () => "Live desktop";

export interface StatusLabel {
  text: string;
  tone: "busy" | "waiting" | "done" | "stopped" | "error";
}

/** The words next to the status mark: "On it", "Waiting for you", "Done", "Stopped". */
export function statusLabel(status: TaskStatus, brief: string | undefined, agent: string): StatusLabel {
  switch (status) {
    case "waking":
      return { text: brief || `Waking up ${agent}'s computer`, tone: "busy" };
    case "running":
      return { text: "On it", tone: "busy" };
    case "waiting":
      return { text: "Waiting for you", tone: "waiting" };
    case "completed":
      return { text: "Done", tone: "done" };
    case "stopped":
      return { text: "Stopped", tone: "stopped" };
    case "error":
      return { text: "Hit an error", tone: "error" };
  }
}

/** Pause bars in a circle: a stopped task. */
export function PauseCircleIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true" className={cn("shrink-0", className)}>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M6.5 5.8v4.4M9.5 5.8v4.4" />
    </svg>
  );
}

/** Dashed circle: the task is waiting for the user. */
export function DashedCircleIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" className={cn("shrink-0", className)}>
      <circle cx="8" cy="8" r="6.3" strokeDasharray="2.6 2.35" />
    </svg>
  );
}

const TONE_TEXT: Record<StatusLabel["tone"], string> = {
  busy: "text-[var(--om-text-1)]",
  waiting: "text-[var(--om-warning)]",
  done: "text-[var(--om-success)]",
  stopped: "text-[var(--om-text-2)]",
  error: "text-[var(--om-danger)]",
};

/** Status mark plus label, as shown above the composer and in the footer of the computer panel. */
export function StatusBadge({ label, className }: { label: StatusLabel; className?: string }) {
  const tone = label.tone;
  return (
    <span className={cn("flex min-w-0 items-center gap-[7px] text-[14px] font-medium leading-5", TONE_TEXT[tone], className)}>
      {tone === "busy" ? (
        <LiveDot size={10} />
      ) : tone === "done" ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <path d="m3 8.5 3.2 3.2L13 4.8" />
        </svg>
      ) : tone === "waiting" ? (
        <DashedCircleIcon size={15} />
      ) : tone === "stopped" ? (
        <PauseCircleIcon size={15} />
      ) : (
        <span aria-hidden="true" className="size-[8px] shrink-0 rounded-full bg-[var(--om-danger)]" />
      )}
      <span className="truncate">{label.text}</span>
    </span>
  );
}
