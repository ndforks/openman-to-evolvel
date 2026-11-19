// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * What OpenMan shows about the person's Orgo account: the workspace it works in, who pays, whether setup can go ahead,
 * what a new agent computer costs (Orgo's prices from `plans.ts`) and the orgo.ai pages to manage it all. Server only.
 *
 * Setup needs a paid plan or bought credit. Orgo's code (`app/api/computers/route.ts`, "NO FREE TIER"): a Free
 * account has no plan computers; a create made with a key on Free runs by the hour from credit
 * (`freeCreateRunsHourly`), so with no plan and no credit there is nothing to pay for the agent computer with.
 */
import type { Session } from "@/lib/session";
import { COMPUTER_SIZES, planTier } from "./plans";
import { ORGO_ORIGIN, OrgoError, planLabel, upgradeUrl, type OrgoClient, type OrgoWorkspace } from "./user-client";

export const ORGO_LINKS = {
  home: ORGO_ORIGIN,
  profile: `${ORGO_ORIGIN}/settings/profile`,
  security: `${ORGO_ORIGIN}/settings/security`,
  billing: `${ORGO_ORIGIN}/settings/billing`,
  credits: `${ORGO_ORIGIN}/settings/billing#credits`,
  apiKeys: `${ORGO_ORIGIN}/api-keys`,
  members: `${ORGO_ORIGIN}/settings/members`,
  starter: upgradeUrl("starter") ?? `${ORGO_ORIGIN}/settings/billing#plans`,
} as const;

/** Orgo's paid tiers are every known tier but Free (`lib/subscription-tiers.ts` isPaidTier). */
export function isPaidTier(tier: string | null | undefined): boolean {
  const t = (tier ?? "").trim().toLowerCase();
  return t !== "" && t !== "free";
}

export interface WorkspaceView {
  id: string;
  name: string;
  /** The person owns it (and so pays for its computers). */
  yours: boolean;
  role: string;
  ownerEmail: string | null;
  ownerPlan: string;
  computers: number;
  /** The person may set up an agent computer there (owner, or a member who is not view-only). */
  usable: boolean;
}

export function workspaceView(w: OrgoWorkspace, userId: string): WorkspaceView {
  const yours = w.user_id === userId || w.role === "owner";
  const role = yours ? "owner" : w.role || "member";
  return {
    id: w.id,
    name: w.name || "Workspace",
    yours,
    role,
    ownerEmail: w.owner_email ?? null,
    ownerPlan: planLabel(w.owner_tier),
    computers: Array.isArray(w.desktops) ? w.desktops.filter((d) => d && d.status !== "deleted").length : 0,
    usable: yours || !/view/i.test(role),
  };
}

export interface BillingReadiness {
  /** The plan of whoever pays for computers in this workspace. */
  plan: string;
  paid: boolean;
  /** The person's Orgo balance in cents, when Orgo tells this key (never for a workspace key or someone else's workspace). */
  balanceCents: number | null;
  payer: "you" | "owner";
  /** True: setup can go ahead. False: it needs a plan or credit first. Null: OpenMan cannot tell (the owner pays). */
  ready: boolean | null;
  /** True when setup can go ahead only on a small credit balance (no plan). */
  lowCredit: boolean;
  /** One line for the person, or null when all is well. */
  note: string | null;
}

/** An hour of a Medium, in cents, rounded up: the least credit that runs the agent computer at all. */
const HOUR_CENTS = Math.ceil((COMPUTER_SIZES[0]?.hourlyUsd ?? 0.055) * 100);

export function billingReadiness(input: { tier: string | null | undefined; balanceCents: number | null; payer: "you" | "owner" }): BillingReadiness {
  const paid = isPaidTier(input.tier);
  const plan = planLabel(input.tier);
  const base = { plan, paid, balanceCents: input.balanceCents, payer: input.payer, lowCredit: false };
  if (paid) return { ...base, ready: true, note: null };
  if (input.payer === "owner") return { ...base, ready: null, note: "The workspace owner is on Orgo's Free plan; they need a plan or credit before a computer can be added here." };
  if (input.balanceCents === null) return { ...base, ready: null, note: "OpenMan can't read your balance with this key. Setup needs an Orgo plan or credit." };
  if (input.balanceCents < HOUR_CENTS)
    return { ...base, ready: false, note: "Your Orgo account has no plan and no credit yet. The agent runs on a cloud computer that Orgo bills to a plan or to credit, so add one of them first." };
  return { ...base, ready: true, lowCredit: input.balanceCents < 500, note: input.balanceCents < 500 ? "You're on Orgo's Free plan with a little credit: the computer runs by the hour from it." : null };
}

export interface NewComputerQuote {
  size: string;
  vcpu: number;
  memoryGb: number;
  /** How Orgo bills it for this account: from the plan's room, or by the hour from credit. */
  billedAs: "plan" | "hourly";
  hourlyUsd: number;
  /** The same Medium always on for a month (730 hours), by the hour. */
  alwaysOnMonthlyUsd: number;
  /** A month on a plan's room, as Orgo prices a Medium. */
  monthlyUsd: number;
  /** How many Mediums the plan keeps always on, when known. */
  planIncludesMediums: number | null;
}

/** Orgo's Hermes template is a Medium (2 vCPU, 8 GB). */
export function newComputerQuote(tier: string | null | undefined): NewComputerQuote {
  const medium = COMPUTER_SIZES[0];
  const paid = isPaidTier(tier);
  return {
    size: medium.name,
    vcpu: medium.vcpu,
    memoryGb: medium.memoryGb,
    billedAs: paid ? "plan" : "hourly",
    hourlyUsd: medium.hourlyUsd,
    alwaysOnMonthlyUsd: Math.round(medium.hourlyUsd * 730 * 100) / 100,
    monthlyUsd: medium.monthlyUsd,
    planIncludesMediums: planTier(tier ?? "")?.alwaysOnMediums ?? null,
  };
}

/** The workspace OpenMan works in, plus who pays and whether setup can go ahead. Never throws for an Orgo refusal. */
export async function orgoAccountView(session: Session, orgo: OrgoClient, workspaceId: string | null) {
  const [ws, credits] = await Promise.all([
    workspaceId ? orgo.workspace(workspaceId).catch(() => null) : Promise.resolve(null),
    orgo.credits().catch((err) => {
      if (err instanceof OrgoError && (err.status === 401 || err.status === 403)) return null;
      return null;
    }),
  ]);
  const workspace = ws ? workspaceView(ws, session.userId) : null;
  const payer: "you" | "owner" = !workspace || workspace.yours ? "you" : "owner";
  const tier = payer === "owner" ? (ws?.owner_tier ?? null) : (credits?.tier ?? ws?.owner_tier ?? null);
  const balanceCents = payer === "you" && typeof credits?.balanceCents === "number" ? credits.balanceCents : null;
  return {
    keyScope: session.keyScope ?? (credits ? "account" : session.dev ? "workspace" : "account"),
    via: session.dev ? "dev" : (session.via ?? "device"),
    workspace,
    workspaceId,
    tier,
    credits: credits ? { balanceCents: typeof credits.balanceCents === "number" ? credits.balanceCents : null, tier: credits.tier ?? null } : null,
    billing: billingReadiness({ tier, balanceCents, payer }),
    links: ORGO_LINKS,
  };
}
