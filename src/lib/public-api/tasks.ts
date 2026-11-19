/** Task operations behind `/api/v1/tasks`, built on the same server functions the web app uses. */
import { z } from "zod";
import { brand } from "@/config/brand";
import type { AgentEvent, CreateTaskInput } from "@/lib/agent/types";
import { createTask, getTask, isModeId, listTasks, runtimeFor } from "@/lib/agent/server/tasks";
import { apiTasksFor, getApiTask, insertApiTask, type ApiTask } from "@/lib/db/public-api";
import type { Store, TaskView } from "@/lib/store";
import { ApiError, notFound, type Ctx } from "./http";
import { checkSchema } from "./structured";
import { emit, taskEventData } from "./webhooks";
import { pendingRequest, taskView } from "./views";

const httpUrl = z
  .string()
  .max(4000)
  .refine((u) => /^https?:\/\//i.test(u), "Attachments are passed by http(s) URL.");

export const createTaskSchema = z.object({
  prompt: z.string().trim().min(1, "prompt is required.").max(200_000),
  mode: z
    .string()
    .optional()
    .refine((m) => m === undefined || isModeId(m), `mode must be one of: ${Object.keys(brand.modes).join(", ")}.`),
  effort: z.enum(["medium", "high", "extra", "ultra"]).optional(),
  project_id: z.string().max(200).nullish(),
  connectors: z.array(z.string().max(200)).max(100).optional(),
  skills: z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "Skill names are lowercase slugs.")).max(50).optional(),
  attachments: z
    .array(z.object({ url: httpUrl, name: z.string().trim().min(1).max(500).optional() }))
    .max(50)
    .optional(),
  output_schema: z.record(z.string(), z.unknown()).optional(),
});
export type CreateTaskBody = z.infer<typeof createTaskSchema>;

function nameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "attachment";
  } catch {
    return "attachment";
  }
}

export async function createApiTask(ctx: Ctx, store: Store, b: CreateTaskBody) {
  if (b.output_schema) {
    try {
      checkSchema(b.output_schema);
    } catch (err) {
      throw new ApiError("invalid_request", "invalid_output_schema", err instanceof Error ? err.message : "Invalid output_schema.", "output_schema");
    }
  }
  // Skills are loaded by the agent by name; the request names which ones to use.
  const prompt = b.skills?.length ? `${b.prompt}\n\nUse these skills where they help: ${b.skills.map((s) => `/${s}`).join(", ")}.` : b.prompt;
  const input: CreateTaskInput = {
    prompt,
    mode: isModeId(b.mode) ? b.mode : "standard",
    ...(b.effort ? { effort: b.effort } : {}),
    projectId: b.project_id ?? null,
    ...(b.connectors?.length ? { connectors: b.connectors } : {}),
    ...(b.attachments?.length ? { attachments: b.attachments.map((a) => ({ url: a.url, name: a.name ?? nameFromUrl(a.url) })) } : {}),
  };
  const task = await createTask(store, input);
  await insertApiTask({ taskId: task.id, userId: ctx.session.userId, apiKeyId: ctx.keyId, outputSchema: b.output_schema ?? null });
  const api = await getApiTask(ctx.session.userId, task.id);
  // task.created goes out at once; the scanner would find it too, and the event id makes that harmless.
  void taskEventData(ctx.session.userId, task.id)
    .then((data) => (data ? emit(ctx.session.userId, `${task.id}:created`, "task.created", data) : 0))
    .catch(() => undefined);
  return taskView(task, api);
}

export async function listApiTasks(ctx: Ctx, store: Store, opts: { archived: boolean | "all" }) {
  const tasks = await listTasks(store, opts);
  const api = await apiTasksFor(
    ctx.session.userId,
    tasks.map((t) => t.id),
  );
  return { tasks, api };
}

/** A task with its events, or a 404. */
export async function loadTask(ctx: Ctx, store: Store, id: string): Promise<{ task: TaskView; events: AgentEvent[]; api: ApiTask | null }> {
  const result = await getTask(store, id);
  if (!result) throw notFound("Task");
  const api = await getApiTask(ctx.session.userId, id);
  return { ...result, api };
}

export function taskDetail(t: { task: TaskView; events: AgentEvent[]; api: ApiTask | null }) {
  const last = t.events.length ? t.events[t.events.length - 1].seq : 0;
  return { ...taskView(t.task, t.api), last_seq: last, pending_request: pendingRequest(t.events, t.task.status) };
}

export async function runtimeOr404(store: Store, id: string) {
  const runtime = await runtimeFor(store, id);
  if (!runtime) throw notFound("Task");
  return runtime;
}

