// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { BelowPlans } from "@/components/marketing/pricing/below-plans";
import { PricingPlans } from "@/components/marketing/pricing/pricing-plans";

export const metadata: Metadata = {
  title: `Pricing | ${brand.name}`,
  description: `${brand.name} is billed through Orgo. See the Starter, Growth and Scale plans side by side, or top up credits and pay only for use.`,
};

export default function PricingPage() {
  return (
    <main className="flex flex-col items-center bg-[var(--om-bg)] px-4 pt-[88px] pb-[96px]">
      <h1 className="max-w-[800px] text-center font-serif text-[32px] font-bold leading-[40px] tracking-[-0.01em] text-[var(--om-text-1)] sm:text-[48px] sm:leading-[58px]">
        Pricing
      </h1>
      <p className="max-w-[640px] pt-[12px] text-center text-[15px] leading-[22px] text-[var(--om-text-2)]">
        {brand.name} has no plans of its own. You pay Orgo for the computer and the model use, at Orgo&apos;s published rates.
      </p>

      <div className="mx-auto flex w-full max-w-[327px] flex-col md:max-w-[752px] lg:max-w-[984px]">
        <PricingPlans />
        <BelowPlans />
      </div>
    </main>
  );
}
