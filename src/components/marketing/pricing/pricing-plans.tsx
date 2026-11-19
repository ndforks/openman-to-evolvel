// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** The billing switch and the three plan cards, sharing one period. */
import { useState } from "react";
import type { BillingPeriod } from "@/lib/orgo/plans";
import { BillingToggle } from "./billing-toggle";
import { PlanCard } from "./plan-card";
import { plans } from "./plans";

export function PricingPlans() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  return (
    <>
      <BillingToggle value={period} onChange={setPeriod} className="mt-[40px] self-center md:mt-[44px]" />
      {/* One column on phones, two (third centred) on tablets, three from 1024px. */}
      <div className="mt-[16px] grid grid-cols-1 gap-x-[16px] gap-y-[12px] md:grid-cols-4 lg:grid-cols-6 lg:gap-x-[12px]">
        {plans.map((plan, index) => (
          <div key={plan.tier.id} className={index === plans.length - 1 ? "min-w-0 md:col-span-2 md:col-start-2 lg:col-start-auto" : "min-w-0 md:col-span-2"}>
            <PlanCard plan={plan} period={period} />
          </div>
        ))}
      </div>
    </>
  );
}
