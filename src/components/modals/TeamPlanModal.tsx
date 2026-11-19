// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * "Plans for teams": Orgo's two plans for teams (Growth and Scale) with a monthly / yearly switch, as two cards.
 * Orgo prices plans, not seats: each plan includes its teammates.
 */
import { useState } from "react";
import { HelpGlyph } from "@/components/settings/ui";
import { brand } from "@/config/brand";
import { useCredits } from "@/lib/billing";
import { PLAN_TIERS, planTier, type BillingPeriod } from "@/lib/orgo/plans";
import { ANNUAL_LABEL, BillingToggle, PlanButton, PlanGlyph, PlanNotice, PricingFrame, TierPrice, tierFeatures, useUpgrade } from "./UpgradeProModal";

const TEAM_TIERS = PLAN_TIERS.filter((tier) => tier.id === "growth" || tier.id === "scale");

const CARD = "flex min-h-[572px] w-[308px] min-w-0 shrink flex-col rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] px-[16px] py-[20px] max-[700px]:w-full";

export function TeamPlanModal() {
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const { opening, go } = useUpgrade(period);
  const { tier } = useCredits();
  const currentId = tier ? planTier(tier)?.id : undefined;

  return (
    <PricingFrame title="Plans for teams" className="w-[672px]" contentClassName="px-[22px] pb-[20px] pt-[26px]">
      <h2 className="shrink-0 text-center font-serif text-[26px] leading-[34px] text-[var(--om-text-1)]">Plans for teams</h2>
      <p className="shrink-0 pt-[6px] text-center text-[13.5px] leading-[19px] text-[var(--om-text-2)]">Bring your colleagues into {brand.name}. Seats come with the plan, so there is no per-person fee.</p>
      <BillingToggle className="mt-[18px]" value={period === "yearly" ? "annual" : "monthly"} annualLabel={ANNUAL_LABEL} onChange={(next) => setPeriod(next === "annual" ? "yearly" : "monthly")} />

      <div className="mt-[20px] flex w-full shrink-0 gap-[12px] max-[700px]:flex-col">
        {TEAM_TIERS.map((candidate) => {
          const current = candidate.id === currentId;
          return (
            <div key={candidate.id} className={CARD}>
              <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{candidate.name}</div>
              <div className="pt-[14px]">
                <TierPrice tier={candidate} period={period} size="lg" />
              </div>
              <div className="pt-[18px] text-[13px] leading-[18px] text-[var(--om-text-1)]">
                {`${candidate.tagline}: up to ${candidate.teammates} teammates sharing ${candidate.alwaysOnMediums} always-on computers`}
              </div>
              <PlanButton tone={current ? "outline" : "light"} className="mt-[14px] leading-[16px]" onClick={() => go(candidate.id)}>
                {current ? "Manage plan" : `Choose ${candidate.name}`}
              </PlanButton>
              {opening === candidate.id ? <PlanNotice>Opening Orgo billing…</PlanNotice> : null}
              <ul className="flex flex-col gap-[10px] pt-[18px]">
                {tierFeatures(candidate).map((feature) => (
                  <li key={feature.text} className="flex items-start gap-[9px]">
                    <PlanGlyph name={feature.glyph} className="mt-px" />
                    <span className="text-[12.5px] leading-[17px] text-[var(--om-text-1)]">
                      {feature.text}
                      {feature.help ? (
                        <span title={feature.help} className="ml-[6px] inline-flex translate-y-[2px]">
                          <HelpGlyph size={13} />
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 pt-[16px] text-center text-[12.5px] leading-[17px] text-[var(--om-text-2)]">
        Over 25 people, bigger machines or special terms? Orgo Enterprise is quoted per account:{" "}
        <a href="https://www.orgo.ai" target="_blank" rel="noreferrer" className="underline decoration-1 underline-offset-2 outline-none hover:text-[var(--om-text-1)] focus-visible:text-[var(--om-text-1)]">
          talk to Orgo
        </a>
        .
      </div>
    </PricingFrame>
  );
}
