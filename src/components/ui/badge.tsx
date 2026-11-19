/** Small labels: the serif "Pro" chip, the grey "Beta" tag and the blue promo pill. */
import type { ReactNode } from "react";
import { cn } from "./cn";

const CHIP_FILL = "bg-[var(--om-fill)]";

export function ProBadge({ className, children = "Pro" }: { className?: string; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[5px] px-[6px] py-[1px] font-serif text-[12px] font-bold leading-[16px] text-[var(--om-text-1)]", CHIP_FILL, className)}>
      {children}
    </span>
  );
}

export function Tag({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-[18px] shrink-0 items-center rounded-[5px] px-[5px] text-[12px] leading-[16px] text-[var(--om-text-2)]", CHIP_FILL, className)}>
      {children}
    </span>
  );
}

export function PromoPill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-[20px] shrink-0 items-center whitespace-pre rounded-full bg-[var(--om-fill-accent)] px-[6px] text-[12px] leading-[16px] text-[var(--om-text-accent)]", className)}>
      {children}
    </span>
  );
}
