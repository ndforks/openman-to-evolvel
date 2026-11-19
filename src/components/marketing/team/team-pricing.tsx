/** "What it costs": one card listing Orgo's plans from the catalog, with a link to the full pricing page. */
import Link from "next/link";
import { Check } from "lucide-react";
import { CREDITS, PLAN_TIERS, formatUsd } from "@/lib/orgo/plans";
import { Section, SectionHeading } from "./section";

const POINTS = [
  "No seat licence: every person pays from their own Orgo account",
  `Top up credits as needed, or take an Orgo plan for computers that stay on and a monthly credit allowance`,
  `Model use at list price plus ${CREDITS.modelMarkupPercent}%`,
  "Invoices, cards and plan changes all live in Orgo",
];

export function TeamPricing() {
  return (
    <Section className="flex flex-col items-center gap-[28px] pt-16 md:pt-[110px]">
      <SectionHeading className="text-center">What it costs</SectionHeading>
      <div className="flex w-full max-w-[560px] flex-col gap-[14px] rounded-[16px] border border-black/8 bg-[var(--om-surface)] p-[24px]">
        <div className="text-[18px] leading-[22px] font-semibold text-[var(--om-text-1)]">Orgo plans</div>
        <ul className="flex flex-col">
          {PLAN_TIERS.map((tier) => (
            <li key={tier.id} className="flex items-baseline justify-between gap-3 border-b border-[var(--om-border)] py-[10px] last:border-b-0">
              <span className="text-[14px] leading-[18px] text-[var(--om-text-1)]">
                {tier.name} <span className="text-[var(--om-text-3)]">· {tier.tagline}</span>
              </span>
              <span className="text-[14px] leading-[18px] font-semibold whitespace-nowrap text-[var(--om-text-1)]">{formatUsd(tier.monthlyUsd)} / month</span>
            </li>
          ))}
        </ul>
        <Link
          href="/pricing"
          className="flex h-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--om-btn-primary)] text-[14px] leading-[18px] font-semibold text-[var(--om-text-inverse)] transition-opacity hover:opacity-90 active:opacity-80"
        >
          See every plan
        </Link>
        <ul className="flex flex-col gap-[8px]">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-[6px] text-[13.5px] leading-[19px] text-[var(--om-text-1)]">
              <Check size={13} strokeWidth={2.5} className="mt-[3px] shrink-0" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
