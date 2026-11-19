"use client";

import { cn } from "@/components/ui/cn";

/** Live bars from recent microphone levels (0..1, oldest first). Quiet input still shows a thin line. */
export function Waveform({ levels, className, barClassName }: { levels: number[]; className?: string; barClassName?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex h-[24px] min-w-0 items-center gap-[2px] overflow-hidden", className)}>
      {levels.map((level, i) => (
        <span
          key={i}
          className={cn("w-[3px] shrink-0 rounded-full bg-[var(--om-icon-1)] transition-[height] duration-75", barClassName)}
          style={{ height: `${Math.max(3, Math.round(level * 24))}px`, opacity: 0.35 + 0.65 * Math.min(1, level * 1.6) }}
        />
      ))}
    </div>
  );
}
