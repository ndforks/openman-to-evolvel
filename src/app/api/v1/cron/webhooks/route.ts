import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processOutbox } from "@/lib/public-api/webhooks";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7).trim() : (req.headers.get("x-cron-secret") ?? "");
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/v1/cron/webhooks: one outbox pass (structured outputs owed, new task events, due webhook
 * deliveries with retries). `Authorization: Bearer $CRON_SECRET`. Safe to call concurrently. Not an API-key route.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: { type: "authentication_error", code: "invalid_cron_secret", message: "Unauthorized." } }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, data: await processOutbox() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/v1] outbox pass failed:", err);
    return NextResponse.json({ ok: false, error: { type: "internal_error", code: "outbox_failed", message: err instanceof Error ? err.message : "Failed." } }, { status: 500 });
  }
}
