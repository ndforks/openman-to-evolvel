import type { NextRequest } from "next/server";
import { automationInputSchema } from "@/lib/automations/types";
import { editAutomation, removeAutomation, setEnabled, toView } from "@/lib/automations/service";
import { getAutomation, latestRuns } from "@/lib/db/automations";
import { baseUrl, notFound, ok, rawBody, v1, validate } from "@/lib/public-api/http";
import { camel, snake } from "@/lib/public-api/resources";

type Params = { params: Promise<{ id: string }> };
const view = (a: Parameters<typeof toView>[0], base: string, last?: Parameters<typeof toView>[2]) => ({ object: "automation", ...(snake(toView(a, base, last)) as Record<string, unknown>) });

/** GET /api/v1/automations/{id} */
export function GET(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const a = await getAutomation(ctx.session.userId, id);
    if (!a) throw notFound("Automation");
    const last = await latestRuns(ctx.session.userId, [a.id]);
    return ok(ctx, view(a, baseUrl(req), last.get(a.id)));
  });
}

/**
 * PATCH /api/v1/automations/{id}: `{ enabled }` alone pauses or resumes; any other field is merged into the
 * current settings and the result validated like a create.
 */
export function PATCH(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const { json } = await rawBody(req);
    const patch = camel(json) as Record<string, unknown>;
    const current = await getAutomation(ctx.session.userId, id);
    if (!current) throw notFound("Automation");
    const keys = Object.keys(patch);
    if (keys.length === 1 && keys[0] === "enabled" && typeof patch.enabled === "boolean") return ok(ctx, view(await setEnabled(ctx.session, id, patch.enabled), baseUrl(req)));
    const base = { name: current.name, kind: current.kind, prompt: current.prompt, repeat: current.repeat, timezone: current.timezone, endsAt: current.endsAt, triggers: (current.triggers ?? []).map((t) => (t.type === "webhook" ? { id: t.id, type: "webhook", conditions: t.conditions, authHeaderName: t.authHeaderName } : t)), mode: current.mode, runIn: current.runIn, projectId: current.projectId, connectors: current.connectors, enabled: current.enabled };
    const input = validate({ ...base, ...patch }, automationInputSchema);
    return ok(ctx, view(await editAutomation(ctx.session, id, input), baseUrl(req)));
  });
}

/** DELETE /api/v1/automations/{id} */
export function DELETE(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    if (!(await removeAutomation(ctx.session, id))) throw notFound("Automation");
    return ok(ctx, { id, object: "automation", deleted: true });
  });
}
