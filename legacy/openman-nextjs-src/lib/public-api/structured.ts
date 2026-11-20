// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Structured output: a task created with `output_schema` (a JSON Schema) returns a validated object.
 *
 * How: when the task's run completes, one more turn is sent into the same agent session (so it has
 * the whole task in context) asking for only a JSON value matching the schema. When that turn
 * completes, its last assistant message is parsed (code fences and surrounding prose tolerated) and
 * validated with `z.fromJSONSchema(schema)`. The result is stored on `api_tasks` and the task's
 * `task.completed` webhook goes out then, carrying it. One extra model step; no second model client.
 */
import { z } from "zod";
import type { AgentEvent } from "@/lib/agent/types";
import { runtimeFor } from "@/lib/agent/server/tasks";
import { moveStructured, openStructuredTasks, type ApiTask } from "@/lib/db/public-api";
import { ownerStore } from "./owner";

/** Throws a readable message when the schema cannot be used. */
export function checkSchema(schema: unknown): z.ZodType {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("output_schema must be a JSON Schema object.");
  if (JSON.stringify(schema).length > 20_000) throw new Error("output_schema is too large (20 KB max).");
  try {
    return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
  } catch (err) {
    throw new Error(`output_schema is not a usable JSON Schema: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const EXTRACTION_MARK = "Final step for the API caller:";

export function extractionPrompt(schema: Record<string, unknown>): string {
  return [
    `${EXTRACTION_MARK} reply with ONLY a single JSON value that matches the JSON Schema below, filled in from the result of this task.`,
    "No prose, no explanation, no Markdown code fences. Do not use any tools.",
    "",
    "JSON Schema:",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}

/** Pulls the JSON value out of a reply that may wrap it in fences or a sentence. */
export function parseJsonReply(text: string): unknown {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], t];
  const firstObj = t.search(/[[{]/);
  if (firstObj >= 0) {
    const open = t[firstObj];
    const close = open === "{" ? "}" : "]";
    candidates.push(t.slice(firstObj, t.lastIndexOf(close) + 1));
  }
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch {
      // Try the next shape.
    }
  }
  throw new Error("The agent's reply was not JSON.");
}

export function validateOutput(schema: Record<string, unknown>, text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = parseJsonReply(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not JSON." };
  }
  const parsed = checkSchema(schema).safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: `The agent's JSON did not match the schema${issue?.path.length ? ` at ${issue.path.join(".")}` : ""}: ${issue?.message ?? "invalid"}.` };
}

const lastStatus = (events: AgentEvent[], afterSeq: number) => {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.seq <= afterSeq) break;
    if (e.type === "status") return e;
  }
  return null;
};

/** Moves one task's structured output forward. Returns true when it reached a final state. */
export async function advanceOne(t: ApiTask): Promise<boolean> {
  if (!t.outputSchema) return false;
  const store = await ownerStore(t.userId);
  const runtime = await runtimeFor(store, t.taskId);
  if (!runtime) {
    await moveStructured(t.taskId, t.structuredState, { state: "failed", error: "The task no longer exists." });
    return true;
  }
  const events = await runtime.allEvents();
  const lastSeq = events.length ? events[events.length - 1].seq : 0;

  if (t.structuredState === "pending") {
    const status = runtime.task.status;
    if (status === "completed" && runtime.atRest) {
      if (!(await moveStructured(t.taskId, "pending", { state: "requested", requestSeq: lastSeq }))) return false;
      await runtime.queueMessage(extractionPrompt(t.outputSchema));
      return false;
    }
    if (status === "error" || status === "stopped") {
      await moveStructured(t.taskId, "pending", { state: "failed", error: `The task ${status === "error" ? "failed" : "was stopped"} before it produced a result.` });
      return true;
    }
    return false;
  }

  if (t.structuredState === "requested") {
    const from = t.structuredRequestSeq ?? 0;
    const end = lastStatus(events, from);
    if (!end || !["completed", "error", "stopped"].includes(end.status) || !runtime.atRest) return false;
    let reply: string | null = null;
    for (let i = events.length - 1; i >= 0 && events[i].seq > from; i--) {
      const e = events[i];
      if (e.type === "message.completed") {
        reply = e.text;
        break;
      }
    }
    const outcome = end.status !== "completed" || reply === null ? { ok: false as const, error: "The agent did not produce the structured output." } : validateOutput(t.outputSchema, reply);
    const moved = await moveStructured(t.taskId, "requested", outcome.ok ? { state: "done", output: outcome.value, error: null, requestSeq: end.seq } : { state: "failed", error: outcome.error, requestSeq: end.seq });
    if (moved) {
      // Imported here to keep the module graph acyclic at load time.
      const { emit, taskEventData } = await import("./webhooks");
      const data = await taskEventData(t.userId, t.taskId, { status: "completed", seq: end.seq });
      if (data) await emit(t.userId, `${t.taskId}:completed:structured`, "task.completed", data);
    }
    return moved;
  }
  return false;
}

/** Every task still owed a structured output. Returns how many reached a final state. */
export async function advanceStructured(): Promise<number> {
  const open = await openStructuredTasks();
  let done = 0;
  for (const t of open) {
    try {
      if (await advanceOne(t)) done++;
    } catch (err) {
      console.warn(`[api/v1] structured output for ${t.taskId}:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}
