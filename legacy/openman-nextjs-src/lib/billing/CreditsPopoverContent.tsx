// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Body of the credits popover in the top bar: the Orgo balance, the plan, quick top-ups and links to billing.
 * The shell mounts it inside its own popover; this component draws only the content.
 */
import { useState } from "react";
import { CREDITS } from "@/lib/orgo/plans";
import { useUI } from "@/lib/ui-store";
import { formatCredits, formatDollars, topUp, useCredits } from "./client";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function CreditsPopoverContent({ className, onNavigate }: { className?: string; /** Called before a link inside opens something else (so the popover can close). */ onNavigate?: () => void }) {
  const { balanceCents, loading, error, planName } = useCredits();
  const open = useUI((s) => s.open);
  const [busy, setBusy] = useState<number | null>(null);
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const buy = async (cents: number) => {
    setBusy(cents);
    setTopUpError(null);
    try {
      await topUp(cents);
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setBusy(null);
    }
  };

  const go = (name: "settings" | "upgrade-pro", props?: Record<string, unknown>) => {
    onNavigate?.();
    open(name, props);
  };

  return (
    <div className={cx("flex w-[300px] flex-col gap-[12px] p-[14px] font-sans text-[var(--om-text-1)]", className)}>
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="text-[12.5px] leading-[16px] text-[var(--om-text-3)]">Credits</span>
          <span className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em] tabular-nums">
            {balanceCents === null ? (loading ? <span className="inline-block h-[22px] w-[80px] animate-pulse rounded-[6px] bg-[var(--om-fill)] align-middle" /> : "—") : formatCredits(balanceCents)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => go("upgrade-pro")}
          className="mt-[2px] flex h-[26px] shrink-0 cursor-pointer items-center rounded-[7px] border border-[var(--om-border-strong)] px-[8px] text-[12.5px] font-medium leading-[16px] outline-none transition-colors hover:bg-[var(--om-fill-subtle)]"
        >
          {planName}
        </button>
      </div>

      {error && balanceCents === null ? <p className="text-[12.5px] leading-[17px] text-[var(--om-text-3)]">{error}</p> : null}

      <p className="text-[12.5px] leading-[17px] text-[var(--om-text-3)]">One credit is $1. Agent models cost the provider&apos;s price plus {CREDITS.modelMarkupPercent}%; computers by the hour come from the same balance.</p>

      <div className="flex flex-col gap-[6px]">
        <span className="text-[12.5px] font-medium leading-[16px] text-[var(--om-text-2)]">Add credits</span>
        <div className="grid grid-cols-4 gap-[6px]">
          {CREDITS.topUpSuggestedCents.map((cents) => (
            <button
              key={cents}
              type="button"
              disabled={busy !== null}
              onClick={() => void buy(cents)}
              className="flex h-[30px] cursor-pointer items-center justify-center rounded-[8px] border border-[var(--om-border-strong)] text-[13px] font-medium leading-[16px] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)] disabled:cursor-default disabled:opacity-60"
            >
              {busy === cents ? "…" : formatDollars(cents)}
            </button>
          ))}
        </div>
        {topUpError ? (
          <p role="alert" className="text-[12.5px] leading-[17px] text-[var(--om-danger)]">
            {topUpError}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => go("settings", { tab: "billing" })}
        className="flex h-[32px] cursor-pointer items-center justify-center rounded-[8px] bg-[var(--om-btn-primary)] text-[13px] font-medium leading-[16px] text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90"
      >
        Usage &amp; billing
      </button>
    </div>
  );
}
