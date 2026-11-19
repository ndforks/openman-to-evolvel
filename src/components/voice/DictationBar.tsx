"use client";

/**
 * The composer's recording state: a live waveform with a timer and cancel / confirm controls inside the
 * composer card, in place of the text box while `dictation.listening`. The words heard so far show above it.
 *
 * Mount it inside the composer card, replacing the textarea row:
 *   {dictation.listening ? <DictationBar dictation={dictation} /> : <textarea ... />}
 * Confirm inserts the transcript through the `onText` given to `useDictation`; nothing is sent.
 */
import { Check, LoaderCircle, X } from "lucide-react";
import type { Dictation } from "@/components/composer/use-dictation";
import { cn } from "@/components/ui/cn";
import { Tooltip } from "@/components/ui/tooltip";
import { clock } from "@/lib/voice/types";
import { Waveform } from "./Waveform";

const ROUND =
  "flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors disabled:cursor-default disabled:opacity-50";

export function DictationBar({ dictation, className, onDone }: { dictation: Dictation; className?: string; onDone?: () => void }) {
  const { state, text, interim, levels, elapsed, error } = dictation;
  const finishing = state === "finishing";
  const heard = `${text}${text && interim ? " " : ""}${interim}`.trim();
  return (
    <div data-testid="dictation-bar" role="group" aria-label="Voice input" className={cn("flex w-full flex-col gap-[8px] px-[16px]", className)}>
      <p aria-live="polite" className={cn("min-h-[24px] text-[15px] leading-[24px] sm:text-[16px]", heard ? "text-[var(--om-text-1)]" : "text-[var(--om-text-disabled)]")}>
        {heard ? (
          <>
            {text}
            {interim ? <span className="text-[var(--om-text-3)]">{text ? " " : ""}{interim}</span> : null}
          </>
        ) : state === "starting" ? (
          "Starting the microphone…"
        ) : finishing ? (
          "Finishing…"
        ) : (
          "Listening…"
        )}
      </p>
      {error ? <p className="text-[12px] leading-[16px] text-[var(--om-danger)]">{error}</p> : null}
      <div className="flex items-center gap-[12px] pb-[2px]">
        <span className="relative flex size-[8px] shrink-0" aria-hidden="true">
          <span className={cn("absolute inline-flex size-full rounded-full bg-[var(--om-danger)]", !finishing && "animate-ping opacity-60")} />
          <span className="relative inline-flex size-[8px] rounded-full bg-[var(--om-danger)]" />
        </span>
        <Waveform levels={levels} className="flex-1 justify-end" />
        <span className="w-[44px] shrink-0 text-right text-[13px] tabular-nums text-[var(--om-text-2)]" aria-label={`Recording time ${clock(elapsed)}`}>
          {clock(elapsed)}
        </span>
        <Tooltip label="Cancel">
          <button
            type="button"
            aria-label="Cancel voice input"
            onClick={() => {
              dictation.cancel();
              onDone?.();
            }}
            disabled={finishing}
            className={cn(ROUND, "text-[var(--om-icon-2)] hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]")}
          >
            <X size={16} />
          </button>
        </Tooltip>
        <Tooltip label="Done">
          <button
            type="button"
            aria-label="Insert transcript"
            onClick={() => void dictation.stop().then(() => onDone?.())}
            disabled={finishing || state === "starting"}
            className={cn(ROUND, "bg-[var(--om-btn-primary)] text-[var(--om-icon-inverse)] hover:opacity-90 focus-visible:opacity-90")}
          >
            {finishing ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={16} strokeWidth={2.2} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
