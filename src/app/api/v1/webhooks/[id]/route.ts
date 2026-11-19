import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEndpoint, patchEndpoint, removeEndpoint } from "@/lib/db/public-api";
import { ApiError, body, notFound, ok, v1 } from "@/lib/public-api/http";
import { endpointView } from "@/lib/public-api/resources";
import { PUBLIC_EVENTS, webhookUrlProblem } from "@/lib/public-api/webhooks";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/webhooks/{id} */
export function GET(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const e = await getEndpoint(ctx.session.userId, id);
    if (!e) throw notFound("Webhook endpoint");
    return ok(ctx, endpointView(e));
  });
}

const patchSchema = z
  .object({
    url: z.string().trim().max(2000).optional(),
    events: z.array(z.enum([...PUBLIC_EVENTS, "*"])).min(1).optional(),
    enabled: z.boolean().optional(),
    roll_secret: z.boolean().optional(),
  })
  .strict();

/** PATCH /api/v1/webhooks/{id} `{ url?, events?, enabled?, roll_secret? }`. With `roll_secret: true` the new secret is returned once. */
export function PATCH(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const b = await body(req, patchSchema);
    if (b.url !== undefined) {
      const bad = await webhookUrlProblem(b.url);
      if (bad) throw new ApiError("invalid_request", "invalid_url", bad, "url");
    }
    const r = await patchEndpoint(ctx.session.userId, id, { url: b.url, events: b.events ? [...new Set(b.events)] : undefined, enabled: b.enabled, rollSecret: b.roll_secret });
    if (!r) throw notFound("Webhook endpoint");
    return ok(ctx, { ...endpointView(r.endpoint), ...(r.secret ? { secret: r.secret } : {}) });
  });
}

/** DELETE /api/v1/webhooks/{id}: removes the endpoint and its delivery history. */
export function DELETE(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    if (!(await removeEndpoint(ctx.session.userId, id))) throw notFound("Webhook endpoint");
    return ok(ctx, { id, object: "webhook_endpoint", deleted: true });
  });
}
