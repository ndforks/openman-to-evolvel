// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { connection, NextResponse } from "next/server";
import { checkStaleTick } from "@/lib/observability/alerts";
import { cronAuthorized } from "@/lib/observability/cron-auth";
import { deepHealth } from "@/lib/observability/health";
import { readHeartbeat, TICK } from "@/lib/observability/heartbeat";
import { withErrorReporting } from "@/lib/observability/route";

/**
 * GET /api/health/deep: readiness for an operator or an uptime monitor. Needs `Authorization: Bearer $CRON_SECRET`.
 * 200 when the service can serve (database up, gate holding, required config present, scheduler not late), else 503.
 * Counts and ages only; configuration is reported by name, never by value. A late tick also raises the operator alert.
 */
export const GET = withErrorReporting("health.deep", async (req) => {
  await connection();
  if (!cronAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const health = await deepHealth();
  if (health.checks.database.state === "ok") await checkStaleTick(await readHeartbeat(TICK).catch(() => null)).catch(() => null);
  return NextResponse.json(health, { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
});
