// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Credits and billing on the signed-in user's Orgo account, for the browser. Every call goes to this app's own
 * routes (`/api/me`, `/api/billing/*`), which act with the user's Orgo key; nothing here talks to Orgo directly.
 * A credit is one US dollar; balances arrive in whole cents.
 */
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { CREDITS, isValidTopUp, planTier, type BillingPeriod, type PlanTierId } from "@/lib/orgo/plans";

/* ---------- formatting ---------- */

/** Cents -> "$12.34" (a credit is a dollar). Negative amounts read "-$1.20". */
export function formatCredits(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "$0.00";
  const abs = Math.abs(cents) / 100;
  const text = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? "-" : ""}$${text}`;
}

/** Cents -> "$10" for whole dollars, else "$10.50". */
export function formatDollars(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : formatCredits(cents);
}

/* ---------- fetch helpers ---------- */

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

function reason(json: unknown): string | null {
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const value = record.error ?? record.message;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && typeof (value as Record<string, unknown>).message === "string") return String((value as Record<string, unknown>).message);
  }
  return null;
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new BillingError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON.
  }
  if (!res.ok) {
    const fallback = res.status === 401 ? "Sign in with Orgo to see your credits." : res.status === 404 ? "Billing isn't connected in this build yet." : `The server answered ${res.status}.`;
    throw new BillingError(reason(json) ?? fallback, res.status);
  }
  return json as T;
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const pick = (record: Record<string, unknown>, ...keys: string[]): unknown => keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

/* ---------- credits (shared, so the top bar and the billing tab agree) ---------- */

export interface CreditsState {
  balanceCents: number | null;
  /** Orgo tier key ("free", "hacker_v2", ...) when the server sends it. */
  tier: string | null;
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
}

interface CreditsStore extends CreditsState {
  refresh: () => Promise<void>;
}

/** The plan's display name for an Orgo tier key or label ("free" and "Free" read as pay as you go). */
export function planName(tier: string | null): string {
  if (!tier || tier.toLowerCase() === "free") return "Pay as you go";
  const known = planTier(tier);
  if (known) return known.name;
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

let inflight: Promise<void> | null = null;

const useCreditsStore = create<CreditsStore>((set) => ({
  balanceCents: null,
  tier: null,
  loading: false,
  error: null,
  loadedAt: null,
  refresh: () => {
    if (inflight) return inflight;
    set({ loading: true });
    inflight = request("/api/me")
      .then((json) => {
        const me = asRecord(json);
        const credits = asRecord(me.credits);
        const balance = num(pick(credits, "balanceCents", "balance_cents")) ?? num(pick(me, "balanceCents", "creditBalanceCents"));
        const user = asRecord(me.user);
        const tier = str(pick(credits, "tier")) ?? str(user.plan) ?? str(me.plan) ?? str(asRecord(me.plan).tier);
        // `balanceCents: null` means Orgo won't show this credential the balance (a workspace-scoped key).
        set({ balanceCents: balance, tier, loading: false, error: balance === null ? "Orgo didn't share the balance for this sign-in. Sign in with Orgo to see it." : null, loadedAt: Date.now() });
      })
      .catch((err: unknown) => set({ loading: false, error: err instanceof Error ? err.message : "Couldn't load your credits.", loadedAt: Date.now() }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
}));

/** After a credit checkout Orgo returns here with `?credit=added`; its webhook lands within seconds, so re-read for a while. */
function watchCheckoutReturn(refresh: () => Promise<void>): () => void {
  if (typeof window === "undefined") return () => {};
  const url = new URL(window.location.href);
  if (url.searchParams.get("credit") !== "added") return () => {};
  url.searchParams.delete("credit");
  window.history.replaceState(window.history.state, "", url.toString());
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    void refresh();
    if (tries >= 10) clearInterval(timer);
  }, 4000);
  return () => clearInterval(timer);
}

/** The signed-in user's Orgo balance (`GET /api/me` -> `credits.balanceCents`). */
export function useCredits(): CreditsState & { refresh: () => Promise<void>; planName: string } {
  const state = useCreditsStore();
  const { refresh, loadedAt } = state;
  useEffect(() => {
    if (loadedAt === null || Date.now() - loadedAt > 30_000) void refresh();
    return watchCheckoutReturn(refresh);
    // Load once per mount; the store dedupes concurrent calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ...state, planName: planName(state.tier) };
}

/* ---------- usage ---------- */

export interface UsageDay {
  date: string;
  usedCents: number;
  aiCents: number;
  computerCents: number;
  addedCents: number;
}

export interface Usage {
  days: UsageDay[];
  models: { model: string; cents: number }[];
  usedCents: number;
  /** Set when Orgo refuses this credential the report (`available: false`): the reason. */
  unavailable: string | null;
}

function normalizeUsage(json: unknown): Usage {
  const root = asRecord(json);
  const body = root.usage ? asRecord(root.usage) : root;
  const list = Array.isArray(body.daily) ? body.daily : Array.isArray(body.days) ? body.days : [];
  const days = list.map((raw) => {
    const day = asRecord(raw);
    return {
      date: str(day.date) ?? "",
      usedCents: num(pick(day, "used_cents", "usedCents")) ?? 0,
      aiCents: num(pick(day, "ai_cents", "aiCents")) ?? 0,
      computerCents: num(pick(day, "computer_cents", "computerCents")) ?? 0,
      addedCents: num(pick(day, "added_cents", "addedCents")) ?? 0,
    };
  });
  const models = (Array.isArray(body.models) ? body.models : []).map((raw) => {
    const model = asRecord(raw);
    return { model: str(model.model) ?? "Other", cents: num(model.cents) ?? 0 };
  });
  const usedCents = num(pick(body, "used_cents", "usedCents")) ?? days.reduce((sum, day) => sum + day.usedCents, 0);
  return { days, models, usedCents, unavailable: body.available === false ? (str(body.reason) ?? "Orgo didn't share usage for this sign-in.") : null };
}

/** Days Orgo's usage report accepts. */
export const USAGE_RANGES = [7, 30, 90] as const;

/** Spend per day on the user's Orgo account (`GET /api/billing/usage?days=`). */
export function useUsage(days: number): { usage: Usage | null; loading: boolean; error: string | null; refresh: () => void } {
  const [nonce, setNonce] = useState(0);
  const key = `${days}:${nonce}`;
  const [result, setResult] = useState<{ key: string; usage: Usage | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    request(`/api/billing/usage?days=${encodeURIComponent(days)}`)
      .then((json) => live && setResult({ key, usage: normalizeUsage(json), error: null }))
      .catch((err: unknown) => live && setResult({ key, usage: null, error: err instanceof Error ? err.message : "Couldn't load usage." }));
    return () => {
      live = false;
    };
  }, [days, key]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const loading = result?.key !== key;
  // While a new range loads, the previous one stays on screen.
  return { usage: result?.usage ?? null, loading, error: loading ? null : (result?.error ?? null), refresh };
}

/* ---------- transactions ---------- */

export interface CreditTransaction {
  id: string;
  createdAt: string | null;
  amountCents: number;
  balanceAfterCents: number | null;
  /** usage | refund | purchase | initial_grant (Orgo's ledger types). */
  type: string;
  description: string;
  model: string | null;
}

const TYPE_LABELS: Record<string, string> = { usage: "Usage", refund: "Refund", purchase: "Credits added", initial_grant: "Starting credit" };

function transactionsUnavailable(json: unknown): string | null {
  const root = asRecord(json);
  return root.available === false ? (str(root.reason) ?? "Orgo didn't share the credit history for this sign-in.") : null;
}

function normalizeTransactions(json: unknown): CreditTransaction[] {
  const root = asRecord(json);
  const list = Array.isArray(json) ? json : Array.isArray(root.transactions) ? root.transactions : Array.isArray(root.data) ? root.data : [];
  return list.map((raw, index) => {
    const row = asRecord(raw);
    const type = str(row.type) ?? "usage";
    const model = str(row.model);
    return {
      id: str(row.id) ?? String(index),
      createdAt: str(pick(row, "created_at", "createdAt")),
      amountCents: num(pick(row, "amount_cents", "amountCents")) ?? 0,
      balanceAfterCents: num(pick(row, "balance_after_cents", "balanceAfterCents")),
      type,
      description: str(row.description) ?? (model ? `${TYPE_LABELS[type] ?? "Usage"} · ${model}` : (TYPE_LABELS[type] ?? type)),
      model,
    };
  });
}

/** The latest ledger rows on the user's Orgo account (`GET /api/billing/transactions`, newest first). */
export function useTransactions(): { transactions: CreditTransaction[]; loading: boolean; error: string | null; refresh: () => void } {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ nonce: number; transactions: CreditTransaction[]; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    request("/api/billing/transactions")
      .then((json) => live && setResult({ nonce, transactions: normalizeTransactions(json), error: transactionsUnavailable(json) }))
      .catch((err: unknown) => live && setResult({ nonce, transactions: [], error: err instanceof Error ? err.message : "Couldn't load transactions." }));
    return () => {
      live = false;
    };
  }, [nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const loading = result?.nonce !== nonce;
  return { transactions: result?.transactions ?? [], loading, error: loading ? null : (result?.error ?? null), refresh };
}

/* ---------- actions ---------- */

function urlFrom(json: unknown): string {
  const url = str(asRecord(json).url);
  if (!url || !/^https?:\/\//i.test(url)) throw new BillingError("The server didn't return a link.", 502);
  return url;
}

function here(): string {
  return typeof window === "undefined" ? "" : window.location.href;
}

/** Buy credits: Orgo's checkout for any whole dollar from $5 to $10,000 (`POST /api/billing/topup`), then go there. */
export async function topUp(amountCents: number): Promise<void> {
  if (!isValidTopUp(amountCents)) throw new BillingError(`Top-ups are whole dollars from ${formatDollars(CREDITS.topUpMinCents)} to ${formatDollars(CREDITS.topUpMaxCents)}.`, 400);
  const json = await request("/api/billing/topup", { method: "POST", body: JSON.stringify({ amountCents, returnUrl: here() }) });
  window.location.assign(urlFrom(json));
}

/** Cards and invoices in Stripe's portal for the user's Orgo account (`POST /api/billing/portal`). */
export async function openBillingPortal(): Promise<void> {
  const json = await request("/api/billing/portal", { method: "POST", body: JSON.stringify({ returnUrl: here() }) });
  window.location.assign(urlFrom(json));
}

/** Orgo's own plan page with this plan marked: plan changes happen there, never by a key call that charges at once. */
export function orgoPlanPageUrl(tier: PlanTierId): string {
  const orgoTier = planTier(tier)?.orgoTier ?? tier;
  return `https://www.orgo.ai/settings/billing?upgrade=${encodeURIComponent(orgoTier)}#plans`;
}

/**
 * Change plan: ask `GET /api/billing/upgrade-url?tier=` for the link to Orgo's billing page and open it in a new tab.
 * The tab is opened first (so a popup blocker allows it) and pointed at Orgo's public plan page if the route fails.
 */
export async function openUpgrade(tier: PlanTierId, period: BillingPeriod = "monthly"): Promise<void> {
  const tab = typeof window === "undefined" ? null : window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  let url = orgoPlanPageUrl(tier);
  try {
    url = urlFrom(await request(`/api/billing/upgrade-url?tier=${encodeURIComponent(tier)}&period=${period}`));
  } catch {
    // Fall back to Orgo's public plan page: it signs the person in to Orgo first.
  }
  if (tab) tab.location.href = url;
  else window.location.assign(url);
}

export { CREDITS };
