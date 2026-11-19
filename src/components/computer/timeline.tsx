"use client";

/** Scrubber over the task's tool calls: step back and forward, drag to any step, and the "Live" marker at the end. */
import type { CSSProperties } from "react";
import { SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Tooltip } from "@/components/ui/tooltip";

export interface TimelineProps {
  /** Number of steps (tool calls) recorded so far. */
  count: number;
  /** Step on screen. Ignored while `live`. */
  index: number;
  /** Following the newest step. */
  live: boolean;
  /** The task is still running, so "Live" is truly live. */
  running: boolean;
  onSeek: (index: number) => void;
  onLive: () => void;
}

const STEP_BUTTON = "flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors enabled:cursor-pointer enabled:hover:bg-[var(--om-fill)] enabled:hover:text-[var(--om-icon-1)] enabled:focus-visible:bg-[var(--om-fill)] disabled:opacity-40";

export function Timeline({ count, index, live, running, onSeek, onLive }: TimelineProps) {
  const last = Math.max(0, count - 1);
  const position = live ? last : Math.min(Math.max(index, 0), last);
  const empty = count === 0;
  const fill = empty || last === 0 ? 100 : (position / last) * 100;

  const seek = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), last);
    // Reaching the end means following the task again.
    if (clamped >= last) onLive();
    else onSeek(clamped);
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-0 border-t border-[var(--om-border)] pe-5 ps-3">
      <Tooltip label="Previous step">
        <button type="button" aria-label="Previous step" disabled={empty || position === 0} onClick={() => seek(position - 1)} className={STEP_BUTTON}>
          <SkipBack size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label="Next step">
        <button type="button" aria-label="Next step" disabled={empty || live} onClick={() => seek(position + 1)} className={STEP_BUTTON}>
          <SkipForward size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tooltip>
      <input
        type="range"
        aria-label="Step"
        aria-valuetext={empty ? "No steps yet" : `Step ${position + 1} of ${count}`}
        min={0}
        max={last}
        step={1}
        value={position}
        disabled={empty || last === 0}
        onChange={(event) => seek(Number(event.target.value))}
        className="tv-range ms-[6px] min-w-0 flex-1"
        style={{ "--tv-fill": `${fill}%` } as CSSProperties}
      />
      <button
        type="button"
        onClick={onLive}
        aria-pressed={live}
        className="ms-[10px] flex h-7 shrink-0 cursor-pointer items-center gap-[5px] rounded-[6px] text-[13px] font-medium leading-[18px] outline-none focus-visible:ring-1 focus-visible:ring-[var(--om-border-focus)]"
      >
        <span aria-hidden="true" className={cn("size-[6px] rounded-full", live && running ? "bg-[var(--om-success)]" : "bg-[var(--om-icon-3)]")} />
        <span className={live ? "text-[var(--om-text-1)]" : "text-[var(--om-text-3)]"}>Live</span>
      </button>
    </div>
  );
}
