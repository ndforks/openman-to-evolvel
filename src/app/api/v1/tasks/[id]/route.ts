// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { changeTask, deleteTask } from "@/lib/agent/server/tasks";
import { deleteApiTask, getApiTask } from "@/lib/db/public-api";
import { ApiError, body, notFound, ok, storeFor, v1 } from "@/lib/public-api/http";
import { advanceOne } from "@/lib/public-api/structured";
import { loadTask, taskDetail } from "@/lib/public-api/tasks";
import { emit, taskEventData } from "@/lib/public-api/webhooks";
import { taskView } from "@/lib/public-api/views";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/tasks/{id}: the task, the question it waits on (if any), and its structured output (if asked for). */
export function GET(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const store = await storeFor(ctx.session);
    let t = await loadTask(ctx, store, id);
    // Reading a task moves its structured output along without waiting for the next background pass.
    if (t.api?.outputSchema && (t.api.structuredState === "pending" || t.api.structuredState === "requested")) {
      if (await advanceOne(t.api).catch(() => false)) t = await loadTask(ctx, store, id);
    }
    return ok(ctx, taskDetail(t));
  });
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    favorite: z.boolean().optional(),
    archived: z.boolean().optional(),
    project_id: z.string().max(200).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Send at least one of title, favorite, archived, project_id.");

/** PATCH /api/v1/tasks/{id}: `{ title?, favorite?, archived?, project_id? }` (project_id null removes it from its project). */
export function PATCH(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const b = await body(req, patchSchema);
    const store = await storeFor(ctx.session);
    const task = await changeTask(store, id, { title: b.title, favorite: b.favorite, archived: b.archived, projectId: b.project_id });
    if (task === "no-project") throw new ApiError("not_found", "project_not_found", "Project not found.", "project_id");
    if (!task) throw notFound("Task");
    return ok(ctx, taskView(task, await getApiTask(ctx.session.userId, id)));
  });
}

/** DELETE /api/v1/tasks/{id}: stops it if running, then deletes it with its events and files. */
export function DELETE(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const store = await storeFor(ctx.session);
    const data = await taskEventData(ctx.session.userId, id).catch(() => null);
    if (!(await deleteTask(store, id))) throw notFound("Task");
    await deleteApiTask(ctx.session.userId, id).catch(() => undefined);
    if (data) void emit(ctx.session.userId, `${id}:deleted`, "task.deleted", data).catch(() => undefined);
    return ok(ctx, { id, object: "task", deleted: true });
  });
}
