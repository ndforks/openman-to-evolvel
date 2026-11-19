// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Account data for the Settings modal and the shell.
 * Name, email, avatar, plan and the credit balance come from `GET /api/me` (the user's Orgo account).
 * `PLACEHOLDER_ACCOUNT` only fills fields no API serves yet (mail address, phone) and the first paint
 * while `loading` is true. A credit is one US dollar of Orgo balance.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { brand } from "@/config/brand";
import { useSession } from "@/lib/supabase/client";

/** The Orgo side of `GET /api/me`: the workspace OpenMan works in, who pays, and orgo.ai links. */
export interface MeOrgo {
  keyScope: "account" | "workspace";
  via: "device" | "api_key" | "local" | "dev";
  workspace: { id: string; name: string; yours: boolean; role: string; ownerEmail: string | null; ownerPlan: string; computers: number; usable: boolean } | null;
  billing: { plan: string; paid: boolean; balanceCents: number | null; payer: "you" | "owner"; ready: boolean | null; lowCredit: boolean; note: string | null };
  links: { home: string; profile: string; security: string; billing: string; credits: string; apiKeys: string; members: string; starter: string };
}

/** What `GET /api/me` answers. */
export interface MeResponse {
  user: { id: string; name: string; email: string; avatarUrl: string | null; plan: string; dev?: boolean };
  credits: { balanceCents: number | null };
  homeComputer: { id: string; status: string } | null;
  orgo?: MeOrgo;
}

/* One shared fetch of /api/me per page; `reloadAccount()` refreshes it (after a top-up, a plan change). */
let me: MeResponse | null = null;
let meLoading = true;
let meError: string | null = null;
let meVersion = 0;
let meStarted = false;
const meListeners = new Set<() => void>();

function emit() {
  meVersion += 1;
  meListeners.forEach((listener) => listener());
}

export async function reloadAccount(): Promise<MeResponse | null> {
  try {
    const res = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (res.ok) {
      me = (await res.json()) as MeResponse;
      meError = null;
    } else {
      me = null;
      meError = res.status === 401 ? "signed_out" : `HTTP ${res.status}`;
    }
  } catch {
    meError = "offline";
  }
  meLoading = false;
  emit();
  return me;
}

function subscribeMe(listener: () => void) {
  meListeners.add(listener);
  if (!meStarted) {
    meStarted = true;
    void reloadAccount();
  }
  return () => {
    meListeners.delete(listener);
  };
}

export interface AccountCredits {
  /** Credits available right now. */
  total: number;
  /** Portion of `total` that came free with the plan. */
  free: number;
  /** Portion of `total` from the monthly plan allowance. */
  monthly: number;
  /** Portion of `total` bought as add-ons. */
  addOn: number;
  /** Daily refresh credits currently available. */
  dailyRefresh: number;
  /** Daily refresh credits top back up to this number. */
  dailyRefreshTo: number;
  /** Local time of the daily refresh, "HH:MM". */
  dailyRefreshAt: string;
}

export interface Account {
  name: string;
  email: string;
  userId: string;
  /** Workspace label shown under the name. */
  workspace: string;
  /** Plan label, e.g. "Free". */
  plan: string;
  avatarUrl: string | null;
  /** The agent's inbound mail address (on `brand.mailDomain`). */
  mailAddress: string;
  /** Senders allowed to email tasks to the agent. */
  approvedSenders: string[];
  phone: string | null;
  /** Wallet balance in US dollars. */
  walletBalance: number;
  credits: AccountCredits;
}

export const PLACEHOLDER_ACCOUNT: Account = {
  name: "Demo User",
  email: "demo@example.com",
  userId: "100000000000000000",
  workspace: "Personal",
  plan: "Free",
  avatarUrl: null,
  mailAddress: `demo-agent@${brand.mailDomain ?? "example.com"}`,
  approvedSenders: ["demo@example.com"],
  phone: null,
  walletBalance: 0,
  credits: { total: 1000, free: 1000, monthly: 0, addOn: 0, dailyRefresh: 300, dailyRefreshTo: 300, dailyRefreshAt: "00:00" },
};

export interface UseAccount extends Account {
  /** True until `/api/me` has answered once. */
  loading: boolean;
  /** False when Orgo did not tell the balance (signed out, or the dev user's workspace-scoped key). */
  creditsKnown: boolean;
  /** The user's home computer (runs the agent), or null before setup. */
  homeComputer: MeResponse["homeComputer"];
  /** The linked Orgo account's workspace, billing and links, once `/api/me` answered. */
  orgo: MeOrgo | null;
  error: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function useAccount(): UseAccount {
  const { user, session } = useSession();
  const version = useSyncExternalStore(
    subscribeMe,
    () => meVersion,
    () => 0,
  );

  // A sign-in or sign-out in this tab changes who /api/me describes.
  const sessionUser = session?.userId ?? null;
  useEffect(() => {
    if (meStarted && (me?.user.id ?? null) !== sessionUser) void reloadAccount();
  }, [sessionUser]);

  return useMemo(() => {
    void version;
    const live = me?.user;
    const balanceCents = me?.credits.balanceCents ?? null;
    const sessionEmail = text(live?.email) ?? text(user?.email);
    const email = sessionEmail ?? PLACEHOLDER_ACCOUNT.email;
    const dollars = balanceCents === null ? 0 : balanceCents / 100;
    return {
      ...PLACEHOLDER_ACCOUNT,
      name: text(live?.name) ?? text(user?.user_metadata.full_name) ?? PLACEHOLDER_ACCOUNT.name,
      email,
      userId: text(live?.id) ?? text(user?.id) ?? PLACEHOLDER_ACCOUNT.userId,
      plan: text(live?.plan) ?? text(session?.plan) ?? PLACEHOLDER_ACCOUNT.plan,
      avatarUrl: text(live?.avatarUrl) ?? text(user?.user_metadata.avatar_url) ?? PLACEHOLDER_ACCOUNT.avatarUrl,
      workspace: text(me?.orgo?.workspace?.name) ?? PLACEHOLDER_ACCOUNT.workspace,
      approvedSenders: sessionEmail ? [sessionEmail] : PLACEHOLDER_ACCOUNT.approvedSenders,
      walletBalance: dollars,
      credits: { total: dollars, free: 0, monthly: 0, addOn: dollars, dailyRefresh: 0, dailyRefreshTo: 0, dailyRefreshAt: PLACEHOLDER_ACCOUNT.credits.dailyRefreshAt },
      loading: meLoading,
      creditsKnown: balanceCents !== null,
      homeComputer: me?.homeComputer ?? null,
      orgo: me?.orgo ?? null,
      error: meError,
    };
  }, [version, user, session]);
}

/** Thousands separator the same way everywhere: 1000 -> "1,000". */
export function formatCredits(n: number): string {
  return n.toLocaleString("en-US");
}
