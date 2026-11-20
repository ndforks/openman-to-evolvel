// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { connection, NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { getTaskCost } from "@/lib/observability/costs";
import { withErrorReporting } from "@/lib/observability/route";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/costs/tasks/[id]: the signed-in user's model spend on one of their tasks, priced from the token usage the
 * relay stored (`src/lib/observability/costs.ts` says exactly what is and is not included). 404 for a task that is
 * not theirs. `{ cost: { model, runs, pricedRuns, inputTokens, outputTokens, costUsd, basis, computedAt } }`.
 */
export const GET = withErrorReporting<Params>("costs.task", async (_req: NextRequest, { params }) => {
  await connection();
  const session = await requireSession();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const cost = await getTaskCost(session.userId, id);
  if (!cost) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ cost }, { headers: { "Cache-Control": "no-store" } });
});
