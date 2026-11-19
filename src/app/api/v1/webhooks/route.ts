import type { NextRequest } from "next/server";
import { z } from "zod";
import { WEBHOOKS_MAX } from "@/lib/personalization/developers";
import { countEndpoints, insertEndpoint, listEndpoints } from "@/lib/db/public-api";
import { ApiError, idempotent, list, paginate, rawBody, v1, validate } from "@/lib/public-api/http";
import { endpointView } from "@/lib/public-api/resources";
import { PUBLIC_EVENTS, webhookUrlProblem } from "@/lib/public-api/webhooks";

/** GET /api/v1/webhooks: the account's webhook endpoints (the same list as Settings → Developers). */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const endpoints = (await listEndpoints(ctx.session.userId)).map(endpointView);
    return list(ctx, paginate(endpoints, req, (e) => e.id, 50));
  });
}

const schema = z
  .object({
    url: z.string().trim().max(2000),
    events: z
      .array(z.enum([...PUBLIC_EVENTS, "*"]))
      .min(1)
      .default(["*"]),
  })
  .strict();

/**
 * POST /api/v1/webhooks `{ url, events? }`: add an endpoint. Returns its signing `secret` once.
 * `events` defaults to `["*"]` (everything). Honours `Idempotency-Key`.
 */
export function POST(req: NextRequest) {
  return v1(req, async (ctx) => {
    const { raw, json } = await rawBody(req);
    const b = validate(json, schema);
    const bad = await webhookUrlProblem(b.url);
    if (bad) throw new ApiError("invalid_request", "invalid_url", bad, "url");
    return idempotent(req, ctx, raw, async () => {
      if ((await countEndpoints(ctx.session.userId)) >= WEBHOOKS_MAX) throw new ApiError("invalid_request", "limit_reached", `You can add at most ${WEBHOOKS_MAX} webhook endpoints.`);
      const { endpoint, secret } = await insertEndpoint(ctx.session.userId, b.url, [...new Set(b.events)]);
      return { status: 201, data: { ...endpointView(endpoint), secret } };
    });
  });
}
