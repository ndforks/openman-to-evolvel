// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Usage caps for operator-paid vendors (limits in `src/config/usage-limits.ts`). `consumeUsage` atomically adds to
 * the user's daily and monthly counters in the database (`usage_consume`) and throws `UsageLimitError` (429) when
 * either cap would be passed, BEFORE the vendor is called. Server only.
 */
import { USAGE_LIMITS, type UsageMetric } from "@/config/usage-limits";
import { db } from "@/lib/db/client";

export class UsageLimitError extends Error {
  readonly status = 429;
  readonly code = "usage_limit";
  constructor(
    message: string,
    readonly metric: UsageMetric,
  ) {
    super(message);
  }
}

export function limitsFor(metric: UsageMetric): { day: number; month: number; label: string } {
  const base = USAGE_LIMITS[metric];
  try {
    const raw = process.env.USAGE_LIMITS ? (JSON.parse(process.env.USAGE_LIMITS) as Record<string, { day?: number; month?: number }>) : {};
    const o = raw[metric];
    return { day: Number.isFinite(o?.day) ? Number(o!.day) : base.day, month: Number.isFinite(o?.month) ? Number(o!.month) : base.month, label: base.label };
  } catch {
    return { ...base };
  }
}

/** Spends `amount` of `metric` for the user, or throws `UsageLimitError`. Fails closed when the counter cannot be read. */
export async function consumeUsage(userId: string, metric: UsageMetric, amount = 1): Promise<void> {
  if (amount <= 0) return;
  const lim = limitsFor(metric);
  const { data, error } = await db().rpc("usage_consume", { p_user: userId, p_metric: metric, p_amount: Math.ceil(amount), p_day_limit: lim.day, p_month_limit: lim.month });
  if (error) throw new UsageLimitError("Usage limits can't be checked right now. Try again in a minute.", metric);
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; day_used?: number; month_used?: number } | null;
  if (!row?.ok) {
    const daily = Number(row?.day_used ?? 0) + amount > lim.day;
    throw new UsageLimitError(
      daily
        ? `You've reached today's limit of ${lim.day} ${lim.label}. It resets at midnight UTC.`
        : `You've reached this month's limit of ${lim.month} ${lim.label}. It resets on the 1st (UTC).`,
      metric,
    );
  }
}
