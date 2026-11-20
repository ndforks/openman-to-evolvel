// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { automationInputSchema } from "@/lib/automations/types";
import { createAutomation, listViews, toView } from "@/lib/automations/service";
import { baseUrl, idempotent, list, paginate, rawBody, v1, validate } from "@/lib/public-api/http";
import { camel, snake } from "@/lib/public-api/resources";

/** GET /api/v1/automations: scheduled and triggered automations, newest first, each with its last run. */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const views = (await listViews(ctx.session, baseUrl(req))).map((a) => ({ object: "automation", ...(snake(a) as Record<string, unknown>), id: a.id }));
    return list(ctx, paginate(views, req, (a) => String(a.id), 50));
  });
}

/**
 * POST /api/v1/automations: create one. Body (snake_case): `{ name?, prompt, kind?, repeat?, timezone?, ends_at?, triggers?, mode?,
 * run_in?, project_id?, connectors?, enabled? }`. `repeat` e.g. `{ "freq": "daily", "time": "09:00" }`. Honours `Idempotency-Key`.
 */
export function POST(req: NextRequest) {
  return v1(req, async (ctx) => {
    const { raw, json } = await rawBody(req);
    const input = validate(camel(json), automationInputSchema);
    return idempotent(req, ctx, raw, async () => {
      const a = await createAutomation(ctx.session, input);
      return { status: 201, data: { object: "automation", ...(snake(toView(a, baseUrl(req))) as Record<string, unknown>) } };
    });
  });
}
