// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** The pricing page's plans: Orgo's three, read from the one catalog (`@/lib/orgo/plans`). */
import { PLAN_TIERS, planFeatureLines, type PlanTier } from "@/lib/orgo/plans";
import type { PlanIconName } from "./icons";

export interface PlanBullet {
  icon: PlanIconName;
  label: string;
  /** Tooltip for the small "?" after the label. */
  help?: string;
}

export interface Plan {
  tier: PlanTier;
  /** Blue outline and blue button. */
  featured?: boolean;
  bullets: PlanBullet[];
}

export const plans: Plan[] = PLAN_TIERS.map((tier) => ({
  tier,
  featured: tier.featured,
  bullets: planFeatureLines(tier).map((line) => ({ icon: line.icon, label: line.text, help: line.help })),
}));
