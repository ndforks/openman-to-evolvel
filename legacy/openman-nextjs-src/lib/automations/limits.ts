// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Per-plan limits (plan labels come from Orgo, see `planLabel`). */

export interface PlanLimits {
  /** Automations that may be enabled at once. */
  maxEnabled: number;
  /** Shortest allowed gap between scheduled runs, and between feed polls. */
  minIntervalMinutes: number;
}

export function limitsFor(plan: string | undefined): PlanLimits {
  switch ((plan ?? "").toLowerCase()) {
    case "scale":
    case "enterprise":
      return { maxEnabled: 100, minIntervalMinutes: 5 };
    case "growth":
      return { maxEnabled: 20, minIntervalMinutes: 5 };
    case "starter":
    case "hacker":
    case "startup":
      return { maxEnabled: 10, minIntervalMinutes: 5 };
    default:
      return { maxEnabled: 2, minIntervalMinutes: 15 };
  }
}

/** Hard engine limits, whatever the plan. */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MIN = [1, 5];
/** Consecutive failed runs (after retries) that pause an automation. */
export const PAUSE_AFTER_FAILURES = 3;
/** A run that has not finished after this long is stopped and marked failed. */
export const RUN_TIMEOUT_MS = 2 * 60 * 60_000;
/** Feed polling floor. */
export const POLL_EVERY_MIN = 5;
