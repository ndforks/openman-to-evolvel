"use client";

/** Monthly / Annually segmented control above the plan cards. Annual is Orgo's yearly price: twelve months less 20%. */
import clsx from "clsx";
import { YEARLY_DISCOUNT_PERCENT, type BillingPeriod } from "@/lib/orgo/plans";

const options: { id: BillingPeriod; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: `Yearly (${YEARLY_DISCOUNT_PERCENT}% off)` },
];

export type { BillingPeriod };

export function BillingToggle({ value, onChange, className }: { value: BillingPeriod; onChange: (next: BillingPeriod) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Billing period" className={clsx("flex rounded-[8px] border border-[var(--om-border)] bg-[#ECECEB] p-[2px]", className)}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={clsx(
              "cursor-pointer whitespace-nowrap rounded-[6px] px-[14px] py-[5px] text-[13px] leading-[18px] transition-colors",
              active ? "bg-[var(--om-fill-solid)] font-medium text-[var(--om-text-1)] shadow-[0px_1px_2px_#0000000F]" : "font-normal text-[var(--om-text-3)] hover:text-[var(--om-text-2)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
