import type { NextRequest } from "next/server";
import { ApiError, idempotent, list, paginate, rawBody, storeFor, v1, validate } from "@/lib/public-api/http";
import { createApiTask, createTaskSchema, listApiTasks } from "@/lib/public-api/tasks";
import { internalStatus, taskView } from "@/lib/public-api/views";

/**
 * GET /api/v1/tasks: the account's tasks, newest first.
 * Query: `status` (starting|running|waiting|completed|stopped|failed), `project_id`, `archived` (false|true|all), `limit`, `cursor`.
 */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const q = req.nextUrl.searchParams;
    const archivedRaw = q.get("archived") ?? "false";
    if (!["true", "false", "all"].includes(archivedRaw)) throw new ApiError("invalid_request", "invalid_parameter", "archived must be true, false or all.", "archived");
    const statusRaw = q.get("status");
    const status = statusRaw ? internalStatus(statusRaw) : null;
    if (statusRaw && !status) throw new ApiError("invalid_request", "invalid_parameter", "status must be one of starting, running, waiting, completed, stopped, failed.", "status");
    const projectId = q.get("project_id");
    const store = await storeFor(ctx.session);
    const { tasks, api } = await listApiTasks(ctx, store, { archived: archivedRaw === "all" ? "all" : archivedRaw === "true" });
    const filtered = tasks
      .filter((t) => (!status || t.status === status) && (!projectId || t.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
    const page = paginate(filtered, req, (t) => `${t.createdAt}|${t.id}`);
    return list(ctx, { ...page, data: page.data.map((t) => taskView(t, api.get(t.id))) });
  });
}

/**
 * POST /api/v1/tasks: create a task and start it. Returns at once with status `starting`.
 * Body: `{ prompt, mode?, effort?, project_id?, connectors?, skills?, attachments?: [{ url, name? }], output_schema? }`.
 * Honours `Idempotency-Key`.
 */
export function POST(req: NextRequest) {
  return v1(req, async (ctx) => {
    const { raw, json } = await rawBody(req);
    const b = validate(json, createTaskSchema);
    return idempotent(req, ctx, raw, async () => {
      const store = await storeFor(ctx.session);
      return { status: 201, data: await createApiTask(ctx, store, b) };
    });
  });
}
