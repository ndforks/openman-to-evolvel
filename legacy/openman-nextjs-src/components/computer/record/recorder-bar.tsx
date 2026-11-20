// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Floating bar shown while a skill is being recorded: name, elapsed time, step count, pause capture, paste and Stop. */
import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, EyeOff, Pause, Play, Square } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import type { RecorderSnapshot } from "@/lib/recording/recorder";
import { clock, describeStep } from "@/lib/recording/types";

export interface RecorderBarProps {
  name: string;
  startedAt: number;
  snap: RecorderSnapshot | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onPaste: (text: string) => void;
  canPaste: boolean;
}

const PILL = "flex h-8 shrink-0 cursor-pointer items-center gap-[6px] rounded-full px-3 text-[13px] font-medium leading-[18px] outline-none transition-colors";

export function RecorderBar({ name, startedAt, snap, onPause, onResume, onStop, onPaste, canPaste }: RecorderBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const paused = snap?.paused ?? false;
  const last = snap?.last && snap.last.kind !== "pause" ? describeStep(snap.last) : null;

  return (
    <div role="region" aria-label="Skill recorder" className="pointer-events-auto flex max-w-[calc(100%-24px)] flex-col items-center gap-[6px]">
      <div className="flex items-center gap-2 rounded-full border border-[var(--om-border)] bg-[var(--om-surface)] py-[6px] pe-[6px] ps-4 shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
        <span className={cn("size-[9px] shrink-0 rounded-full", paused ? "bg-[var(--om-icon-3)]" : "animate-pulse bg-[#ef4444]")} aria-hidden="true" />
        <span className="min-w-0 max-w-[260px] truncate text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]" title={`Skill recording · ${name}`}>
          Skill recording · {name}
        </span>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--om-text-2)]" aria-label="Elapsed time">
          {clock(now - startedAt)}
        </span>
        <span className="shrink-0 text-[12px] text-[var(--om-text-3)]" data-testid="recorder-steps">
          {snap?.steps ?? 0} steps
        </span>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-[var(--om-border-strong)]" />
        {paused ? (
          <button type="button" onClick={onResume} className={cn(PILL, "bg-[var(--om-fill)] text-[var(--om-text-1)] hover:bg-[var(--om-fill-strong)]")}>
            <Play size={13} strokeWidth={2} aria-hidden="true" />
            Resume capture
          </button>
        ) : (
          <Tooltip label="Stop capturing for a sensitive step. Nothing you do is recorded until you resume.">
            <button type="button" onClick={onPause} className={cn(PILL, "text-[var(--om-text-2)] hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)]")}>
              <Pause size={13} strokeWidth={2} aria-hidden="true" />
              Pause capture
            </button>
          </Tooltip>
        )}
        <Popover open={pasteOpen} onOpenChange={setPasteOpen}>
          <Tooltip label={canPaste ? "Paste text into the computer" : "Paste is available while connected"}>
            <PopoverTrigger asChild>
              <button type="button" disabled={!canPaste} aria-label="Paste text into the computer" className={cn(PILL, "px-2 text-[var(--om-text-2)] hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)] disabled:cursor-default disabled:opacity-40")}>
                <ClipboardPaste size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent
            side="top"
            align="center"
            className="w-[320px] rounded-[14px] border border-[var(--om-border)] bg-[var(--om-surface)] p-3 shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              area.current?.focus();
            }}
          >
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text) return;
                onPaste(text);
                setText("");
                setPasteOpen(false);
              }}
            >
              <label className="text-[13px] font-medium text-[var(--om-text-1)]" htmlFor="om-paste">
                Paste into the computer
              </label>
              <textarea id="om-paste" ref={area} value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full resize-none rounded-[10px] border border-[var(--om-border-strong)] bg-transparent p-2 text-[13px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]" placeholder="Text to put on the computer's clipboard" />
              <p className="text-[12px] leading-4 text-[var(--om-text-3)]">It goes to the computer&apos;s clipboard. Then press Ctrl+V there (Ctrl+Shift+V in a terminal). Pasted text is recorded unless capture is paused.</p>
              <button type="submit" disabled={!text} className="h-8 cursor-pointer self-end rounded-full bg-[var(--om-btn-primary)] px-3 text-[13px] font-medium text-[var(--om-text-inverse)] disabled:opacity-40">
                Send to clipboard
              </button>
            </form>
          </PopoverContent>
        </Popover>
        <button type="button" onClick={onStop} className={cn(PILL, "bg-[#ef4444] text-white hover:bg-[#dc2626]")}>
          <Square size={11} strokeWidth={0} fill="currentColor" aria-hidden="true" />
          Stop recording
        </button>
      </div>
      <div className="flex max-w-full items-center gap-2 rounded-full bg-[rgba(0,0,0,0.6)] px-3 py-1 text-[12px] leading-4 text-[#e5e5e5]">
        {paused ? (
          <span>Capture paused. Nothing you do is recorded.</span>
        ) : snap?.hiding ? (
          <span className="flex items-center gap-1">
            <EyeOff size={12} aria-hidden="true" /> Looks like a password prompt: typed text is not recorded.
          </span>
        ) : last ? (
          <span className="min-w-0 truncate">Last step: {last}</span>
        ) : (
          <span>Recording clicks, keys, typed text, scrolls and screenshots of this screen.</span>
        )}
        {snap && snap.failed > 0 ? <span className="shrink-0 text-[#fca5a5]">· {snap.failed} uploads failed</span> : null}
      </div>
    </div>
  );
}
