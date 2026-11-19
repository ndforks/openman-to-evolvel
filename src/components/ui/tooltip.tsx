"use client";

/** Small dark tooltip. Wrap the tree once in `TooltipProvider` (the app layout does). */
import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { usePortalThemeClass } from "./theme";

export const TooltipProvider = RadixTooltip.Provider;

export interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof RadixTooltip.Content>["side"];
  sideOffset?: number;
  /** Trailing keyboard hint, e.g. "⌘K". */
  shortcut?: string;
  className?: string;
}

export function Tooltip({ label, children, side = "top", sideOffset = 4, shortcut, className }: TooltipProps) {
  const theme = usePortalThemeClass();
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cn(
            theme,
            "z-[60] flex w-max min-w-[40px] max-w-[280px] select-none items-center gap-[8px] rounded-[8px] border border-[var(--om-tooltip-border)] bg-[var(--om-tooltip-bg)] px-[8px] py-[4px] font-sans text-[12px] leading-[16px] text-[var(--om-text-on-accent)] antialiased",
            className,
          )}
        >
          {label}
          {shortcut ? <span className="shrink-0 text-[11px] font-bold text-[var(--om-text-3)]">{shortcut}</span> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
