import type { NextRequest } from "next/server";
import { json, withUser } from "@/lib/orgo/http";
import { OrgoError } from "@/lib/orgo/user-client";

const ALLOWED = [7, 30, 90, 365] as const;

/**
 * GET /api/billing/usage?days=30: Orgo's spend per day (AI, computers, credit added) and top models, in cents.
 * `days` is rounded up to 7, 30, 90 or 365 (what Orgo accepts). `available: false` when Orgo refuses this credential.
 */
export function GET(req: NextRequest) {
  return withUser(req, async ({ orgo }) => {
    const asked = Number(req.nextUrl.searchParams.get("days") ?? 30);
    const days = ALLOWED.find((d) => d >= (Number.isFinite(asked) ? asked : 30)) ?? 365;
    try {
      const usage = await orgo.usage(days);
      return json({ available: true, days, usedCents: usage.used_cents ?? 0, daily: usage.days ?? [], models: usage.models ?? [] });
    } catch (err) {
      if (err instanceof OrgoError && err.status === 403) return json({ available: false, days, usedCents: 0, daily: [], models: [], reason: err.message });
      throw err;
    }
  });
}
