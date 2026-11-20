// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Rows under the plan cards: teams, credits without a plan, and where to ask about billing. */
import Link from "next/link";
import { brand } from "@/config/brand";
import { COMPUTER_SIZES, CREDITS, formatUsd } from "@/lib/orgo/plans";
import { BuildingIcon, PlanIcon } from "./icons";

function SparkleIcon({ className }: { className?: string }) {
  return <PlanIcon name="credits" className={className} />;
}

const rowClass =
  "flex min-h-[56px] items-center gap-[10px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[10px] py-[8px]";
const tileClass = "flex size-[35px] shrink-0 items-center justify-center rounded-[8px] bg-[#F0F0EF]";
const outlineButtonClass =
  "flex h-[32px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[8px] border border-[var(--om-btn-border)] px-[11px] text-[14px] font-medium leading-[18px] text-[var(--om-text-1)] transition-colors hover:bg-[var(--om-fill-subtle)]";

export function BelowPlans() {
  return (
    <div className="flex w-full flex-col gap-[8px] pt-[14px]">
      <div className={rowClass}>
        <div className={tileClass}>
          <BuildingIcon className="text-[var(--om-icon-1)]" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="font-serif text-[15px] font-bold leading-[20px] text-[var(--om-text-1)]">
            {brand.name} for teams
          </h2>
          <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
            Everyone uses their own Orgo account; finished work travels by share link.
          </p>
        </div>
        <Link href="/team" className={outlineButtonClass}>
          How it works
        </Link>
      </div>

      <div className={rowClass}>
        <div className={tileClass}>
          <SparkleIcon className="text-[var(--om-icon-1)]" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Skip the plan, buy credits</h2>
          <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
            Credits work without a subscription. A credit equals $1, and you can add {formatUsd(CREDITS.topUpMinCents / 100)} to {formatUsd(CREDITS.topUpMaxCents / 100)} per top-up. Model calls are billed at the provider&apos;s list price plus {CREDITS.modelMarkupPercent}%, and a Medium computer costs {formatUsd(COMPUTER_SIZES[0].hourlyUsd)} per hour.
          </p>
        </div>
      </div>

      <p className="pt-[14px] text-center text-[13px] leading-[18px] text-[var(--om-text-3)]">
        Question about a charge?{" "}
        <Link href="/docs/credits-and-billing" className="underline decoration-1 [text-underline-position:from-font] hover:text-[var(--om-text-2)]">
          See the billing guide
        </Link>{" "}
        or email{" "}
        <a href="mailto:contact@orgo.ai" className="underline decoration-1 [text-underline-position:from-font] hover:text-[var(--om-text-2)]">
          contact@orgo.ai
        </a>
        .
      </p>
    </div>
  );
}
