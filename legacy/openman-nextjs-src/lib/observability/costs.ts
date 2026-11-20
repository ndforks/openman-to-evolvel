// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Model spend per task. The relay stores Hermes' token usage on every `run.completed` event
 * (`src/lib/agent/server/relay.ts`, `usageOf`); this prices it at Orgo's rate card and stores the result in
 * `task_costs`. Server only.
 *
 * What the number is: Orgo's charge for the agent's main model calls (vendor list price plus Orgo's markup,
 * `CREDITS.modelMarkupPercent`). Hermes reports input and output tokens only, without the cache split, so every input
 * token is priced as fresh input: an upper bound. Not included: Hermes' side calls (vision, compression, sub-agents
 * that report their own usage), the computer's time, and runs whose event carries no usage. When the workspace owner
 * keeps their own Anthropic key in Orgo Secrets, Orgo charges nothing for models and this is what Anthropic bills.
 */
import { db, fail } from "@/lib/db/client";
import { MODEL_MAP } from "@/lib/agent/types";
import { CREDITS } from "@/lib/orgo/plans";

/**
 * Raw US dollars per million tokens (orgo-web `lib/credits-shared.ts` RAW_MODEL_PRICING, read in
 * `../research/orgo-web-billing.md` section 1). Orgo rounds the charged rate up to a whole cent per MTok.
 */
export const RAW_RATES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};
/** No rate card in Orgo: the relay falls back to Opus 5.5 (docs/ORGO-ASKS.md #1). */
export const FALLBACK_MODEL = "claude-opus-5-5";

export function chargedRate(model: string): { model: string; input: number; output: number } {
  const m = RAW_RATES[model] ? model : FALLBACK_MODEL;
  const r = RAW_RATES[m];
  const up = (v: number) => Math.ceil(v * (1 + CREDITS.modelMarkupPercent / 100) * 100 - 1e-9) / 100;
  return { model: m, input: up(r.input), output: up(r.output) };
}

export function priceTokens(model: string, inputTokens: number, outputTokens: number): number {
  const r = chargedRate(model);
  return (inputTokens * r.input + outputTokens * r.output) / 1_000_000;
}

export interface TaskCost {
  taskId: string;
  model: string;
  mode: string | null;
  runs: number;
  pricedRuns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  basis: string;
  computedAt: string;
}

const BASIS = `Orgo's charge for the agent's model calls: list price + ${CREDITS.modelMarkupPercent}%, every input token priced as fresh input (upper bound). Excludes computer time and side calls.`;

function modelForTask(mode: string | null): string {
  return (mode && (MODEL_MAP as Record<string, string>)[mode]) || MODEL_MAP.standard;
}

interface UsagePayload {
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Prices one task from its stored events and saves the result. `userId` scopes the read (null only for the
 * scheduler's backfill, which acts on every user's tasks). Null when the task does not exist for that user.
 */
export async function computeTaskCost(taskId: string, userId: string | null): Promise<TaskCost | null> {
  let tq = db().from("tasks").select("id,user_id,mode,meta").eq("id", taskId);
  if (userId) tq = tq.eq("user_id", userId);
  const { data: task, error } = await tq.maybeSingle();
  if (error) fail("read task for cost", error);
  if (!task) return null;
  const row = task as { id: string; user_id: string; mode: string | null; meta: Record<string, unknown> | null };
  const mode = (typeof row.meta?.mode === "string" ? (row.meta.mode as string) : null) ?? row.mode;
  const model = modelForTask(mode);

  const { data: events, error: evError } = await db()
    .from("task_events")
    .select("payload,at")
    .eq("task_id", taskId)
    .eq("user_id", row.user_id)
    .eq("type", "run.completed")
    .order("seq", { ascending: true })
    .limit(2000);
  if (evError) fail("read task usage", evError);
  let inputTokens = 0;
  let outputTokens = 0;
  let pricedRuns = 0;
  let lastAt: string | null = null;
  for (const ev of (events ?? []) as { payload: UsagePayload; at: string }[]) {
    lastAt = ev.at;
    const u = ev.payload?.usage;
    if (!u) continue;
    pricedRuns++;
    inputTokens += Number(u.inputTokens) || 0;
    outputTokens += Number(u.outputTokens) || 0;
  }
  const costUsd = Math.round(priceTokens(model, inputTokens, outputTokens) * 1e6) / 1e6;
  const cost: TaskCost = {
    taskId,
    model: chargedRate(model).model,
    mode,
    runs: (events ?? []).length,
    pricedRuns,
    inputTokens,
    outputTokens,
    costUsd,
    basis: BASIS,
    computedAt: new Date().toISOString(),
  };
  const { error: upError } = await db().from("task_costs").upsert({
    task_id: taskId,
    user_id: row.user_id,
    model: cost.model,
    mode,
    runs: cost.runs,
    priced_runs: pricedRuns,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    basis: BASIS,
    last_event_at: lastAt,
    computed_at: cost.computedAt,
  });
  if (upError) fail("save task cost", upError);
  return cost;
}

/** The one function the UI uses: the signed-in user's task, priced fresh from its events. */
export function getTaskCost(userId: string, taskId: string): Promise<TaskCost | null> {
  return computeTaskCost(taskId, userId);
}

/** Scheduler backfill: prices tasks that changed in the last `hours` (at most `limit`). Returns how many. */
export async function refreshRecentCosts(hours = 2, limit = 25): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await db().from("tasks").select("id,user_id").gte("updated_at", since).order("updated_at", { ascending: false }).limit(limit);
  if (error) fail("list recent tasks", error);
  let n = 0;
  for (const t of (data ?? []) as { id: string; user_id: string }[]) {
    if (await computeTaskCost(t.id, t.user_id).catch(() => null)) n++;
  }
  return n;
}

export type CostCategory = "chat" | "browsing" | "website" | "wide_research" | "other";

/** Rough task kind for the cost report, from the interaction, the title and the tools the agent used. */
export function categorize(t: { interaction: string | null; title: string; tools: string[] }): CostCategory {
  if (t.interaction === "chat") return "chat";
  if (/^build a website/i.test(t.title)) return "website";
  if (/^research (these|the) \d+/i.test(t.title) || t.tools.includes("delegate_task")) return "wide_research";
  if (t.tools.some((n) => n.startsWith("browser") || n === "web_search" || n === "mcp__omtarget__open_url")) return "browsing";
  return "other";
}

export interface CostStats {
  category: CostCategory;
  unit: "reply" | "task";
  n: number;
  p50Usd: number;
  p90Usd: number;
  totalUsd: number;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Median and 90th percentile cost by task kind over the last `days` (every user, operator view). Chat is per reply
 * (one run), the rest per task. Reads stored events directly so the numbers do not depend on the backfill.
 */
export async function costStats(days = 90): Promise<CostStats[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: tasks, error } = await db().from("tasks").select("id,title,mode,meta").gte("created_at", since).limit(5000);
  if (error) fail("list tasks for cost", error);
  const ids = (tasks ?? []).map((t) => (t as { id: string }).id);
  if (!ids.length) return [];
  const runs = new Map<string, { i: number; o: number }[]>();
  const tools = new Map<string, Set<string>>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: evs, error: e2 } = await db().from("task_events").select("task_id,type,payload").in("task_id", chunk).in("type", ["run.completed", "tool.started"]).limit(20000);
    if (e2) fail("read events for cost", e2);
    for (const ev of (evs ?? []) as { task_id: string; type: string; payload: { usage?: { inputTokens?: number; outputTokens?: number }; tool?: string } }[]) {
      if (ev.type === "tool.started" && ev.payload?.tool) {
        if (!tools.has(ev.task_id)) tools.set(ev.task_id, new Set());
        tools.get(ev.task_id)!.add(ev.payload.tool);
      } else if (ev.type === "run.completed" && ev.payload?.usage) {
        if (!runs.has(ev.task_id)) runs.set(ev.task_id, []);
        runs.get(ev.task_id)!.push({ i: Number(ev.payload.usage.inputTokens) || 0, o: Number(ev.payload.usage.outputTokens) || 0 });
      }
    }
  }
  const buckets = new Map<CostCategory, number[]>();
  for (const t of (tasks ?? []) as { id: string; title: string; mode: string | null; meta: Record<string, unknown> | null }[]) {
    const r = runs.get(t.id);
    if (!r?.length) continue;
    const mode = (typeof t.meta?.mode === "string" ? (t.meta.mode as string) : null) ?? t.mode;
    const model = modelForTask(mode);
    const category = categorize({ interaction: typeof t.meta?.interaction === "string" ? (t.meta.interaction as string) : null, title: t.title ?? "", tools: [...(tools.get(t.id) ?? [])] });
    const list = buckets.get(category) ?? [];
    if (category === "chat") for (const run of r) list.push(priceTokens(model, run.i, run.o));
    else list.push(r.reduce((s, run) => s + priceTokens(model, run.i, run.o), 0));
    buckets.set(category, list);
  }
  const order: CostCategory[] = ["chat", "browsing", "website", "wide_research", "other"];
  return order
    .filter((c) => buckets.has(c))
    .map((category) => {
      const v = [...buckets.get(category)!].sort((a, b) => a - b);
      const r4 = (x: number) => Math.round(x * 10000) / 10000;
      return { category, unit: category === "chat" ? "reply" : "task", n: v.length, p50Usd: r4(percentile(v, 0.5)), p90Usd: r4(percentile(v, 0.9)), totalUsd: r4(v.reduce((s, x) => s + x, 0)) };
    });
}
