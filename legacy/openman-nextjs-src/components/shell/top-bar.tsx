// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** 48 px bar above the Home screen: mode picker on the left, plan and credits on the right. */
import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { SparkleIcon } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreditsPopoverContent, formatCredits, useCredits } from "@/lib/billing";
import { useUI } from "@/lib/ui-store";
import { useShellAccount } from "./account";
import { ModePicker } from "./mode-picker";

/** Header pill: 32 px tall, 8 px radius, 1 px secondary-button border, 14 px text. */
const PILL = "flex h-[32px] shrink-0 items-center rounded-[8px] border border-[var(--om-btn-border)] text-[14px] leading-[20px]";

export function PlanPill() {
  const { plan } = useShellAccount();
  const open = useUI((s) => s.open);
  return (
    <div className={cn(PILL, "min-w-0 max-w-[min(360px,35vw)] justify-center overflow-hidden whitespace-nowrap px-[12px] py-[4px]")}>
      <div className="flex min-w-0 items-center gap-[12px]">
        <span className="min-w-0 truncate text-[var(--om-text-3)]">{plan} plan</span>
        <span aria-hidden="true" className="h-[16px] w-px shrink-0 bg-[var(--om-border-strong)]" />
        <button type="button" onClick={() => open("upgrade-pro")} className="shrink-0 cursor-pointer rounded-[8px] text-[var(--om-text-accent)] outline-none transition-opacity hover:opacity-80 focus-visible:underline active:opacity-80">
          Upgrade
        </button>
      </div>
    </div>
  );
}

/** Credits pill: the signed-in user's Orgo balance. Opens the billing module's credits summary. */
export function CreditsPill() {
  const { balanceCents, loading } = useCredits();
  const [isOpen, setIsOpen] = useState(false);
  // A loading shimmer, then the balance; when Orgo reports no balance the pill shows only its icon (never a dash).
  const label = balanceCents === null ? null : formatCredits(balanceCents);
  const pending = balanceCents === null && loading;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ? `${label} credits` : pending ? "Loading credits" : "Credits"}
          aria-busy={pending}
          className={cn(
            PILL,
            "cursor-pointer select-none justify-center gap-[4px] pe-[12px] ps-[8px] font-medium tracking-[-0.15px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]",
            !label && !pending && "pe-[8px]",
          )}
        >
          <SparkleIcon size={16} strokeWidth={2} />
          {pending ? <span aria-hidden="true" className="inline-block h-[14px] w-[40px] animate-pulse rounded-[4px] bg-[var(--om-fill)]" /> : label ? <span className="whitespace-nowrap tabular-nums">{label}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" sideOffset={4} aria-label="Credits" className="overflow-hidden rounded-[12px] p-0">
        <CreditsPopoverContent onNavigate={() => setIsOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

export function TopBar({ left, className }: { left?: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-[48px] w-full shrink-0 items-center justify-between border-b border-transparent bg-[var(--om-bg)] py-[8px] pe-[20px] ps-[16px] md:pe-[24px]",
        className,
      )}
    >
      <div className="relative z-20 flex min-w-0 items-center overflow-hidden">{left ?? <ModePicker />}</div>
      <div className="flex shrink-0 items-center gap-[8px]">
        <PlanPill />
        <CreditsPill />
      </div>
    </header>
  );
}
