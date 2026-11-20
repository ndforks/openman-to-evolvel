// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** One plan card: name, Orgo's price for the chosen period, tagline, a button to Orgo's billing page and what the plan includes. */
import { useState } from "react";
import clsx from "clsx";
import { openUpgrade } from "@/lib/billing";
import { formatUsd, planPrice, type BillingPeriod } from "@/lib/orgo/plans";
import { HelpIcon, PlanIcon } from "./icons";
import type { Plan } from "./plans";

export function PlanCard({ plan, period, className }: { plan: Plan; period: BillingPeriod; className?: string }) {
  const { tier } = plan;
  const price = planPrice(tier, period);
  const [opening, setOpening] = useState(false);

  return (
    <article
      aria-label={`${tier.name}: ${formatUsd(price.perMonthUsd)} per month`}
      className={clsx(
        "relative flex h-full w-full flex-col rounded-[16px] bg-[var(--om-surface)] px-[13px] pt-[16px] pb-[28px]",
        plan.featured ? "border-2 border-[var(--om-btn-accent)]" : "border border-black/8",
        className,
      )}
    >
      <p className="px-[3px] pb-[6px] text-[14px] font-medium leading-[18px] text-[var(--om-text-2)]">{tier.name}</p>
      <div className="flex items-baseline gap-[4px] px-[3px]">
        <span className="text-[28px] font-semibold leading-[34px] text-[var(--om-text-1)]">{formatUsd(price.perMonthUsd)}</span>
        <span className="text-[14px] leading-[18px] text-[var(--om-text-3)]">/ month</span>
      </div>
      <p className="h-[18px] px-[3px] pt-[2px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{period === "yearly" ? `${formatUsd(price.billedUsd)} billed yearly` : "Billed monthly"}</p>

      <p className="px-[3px] pt-[22px] pb-[14px] text-[14px] leading-[20px] text-[var(--om-text-1)]">{tier.tagline}</p>

      <button
        type="button"
        onClick={() => {
          setOpening(true);
          void openUpgrade(tier.id, period).finally(() => setTimeout(() => setOpening(false), 1500));
        }}
        className={clsx(
          "flex h-[35px] w-full shrink-0 cursor-pointer items-center justify-center rounded-full text-[14px] font-semibold leading-[18px] transition-opacity hover:opacity-90 active:opacity-80",
          plan.featured ? "bg-[var(--om-btn-accent)] text-[var(--om-text-on-accent)]" : "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]",
        )}
      >
        {opening ? "Opening Orgo billing…" : `Choose ${tier.name}`}
      </button>

      <ul className="flex flex-col gap-[12px] px-[3px] pt-[24px]">
        {plan.bullets.map((bullet) => (
          <li key={bullet.label} className="flex items-start gap-[8px]">
            <PlanIcon name={bullet.icon} className="mt-[2px] shrink-0 text-[var(--om-icon-1)]" />
            <span className="min-w-0 text-[13.5px] leading-[20px] tracking-[-0.01em] text-[var(--om-text-1)]">
              {bullet.label}
              {bullet.help ? (
                <span title={bullet.help} className="ml-[5px] inline-flex translate-y-[2px]">
                  <HelpIcon className="shrink-0 text-[var(--om-text-4)]" />
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {plan.featured ? (
        <span className="absolute right-[10px] top-[10px] rounded-[5px] bg-[var(--om-fill-accent)] px-[7px] py-[2px] text-[12px] font-medium leading-[18px] text-[var(--om-text-accent)]">Most picked</span>
      ) : null}
    </article>
  );
}
