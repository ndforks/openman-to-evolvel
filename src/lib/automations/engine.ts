// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The automations engine: starts runs as the automation's owner (through the same task relay a
 * person uses), follows them to completion, retries with backoff and pauses after repeated failures.
 *
 * Concurrency: every state change that matters is a compare-and-set in the database (`claimColumn`,
 * `updateRun(..., fromStatus)`), plus a unique slot per (automation, due time, attempt). Two ticks
 * running at once can both look at the same row; only one of them acts on it.
 */
import type { AgentEvent } from "@/lib/agent/types";
import { hermesTarget, primeConnection } from "@/lib/agent/server/connection";
import { refreshOwner } from "@/lib/agent/server/relay";
import { changeTask, createTask, getTask, isModeId, runtimeFor } from "@/lib/agent/server/tasks";
import {
  claimColumn,
  dueAutomations,
  getAutomation,
  insertRun,
  openRuns,
  patchAutomationById,
  pollableAutomations,
  updateRun,
  type AutomationRecord,
  type RunRecord,
} from "@/lib/db/automations";
import { createNotification } from "@/lib/db/notifications";
import { DEV_USER_ID, type Session } from "@/lib/session";
import { DbStore } from "@/lib/store/db-store";
import { allConditionsHold } from "./conditions";
import { MAX_ATTEMPTS, PAUSE_AFTER_FAILURES, POLL_EVERY_MIN, RETRY_DELAYS_MIN, RUN_TIMEOUT_MS } from "./limits";
import { fetchFeed, type FeedItem } from "./rss";
import { nextRun, wallClock } from "./schedule";
import type { RepeatRule, RunStatus, RunTrigger } from "./types";

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** A session for background work: the dev user keeps the env setup, everyone else their account. */
export function sessionFor(userId: string): Session {
  if (userId === DEV_USER_ID) return { userId, email: "dev@localhost", name: "Developer", plan: "Free", workspaceId: process.env.ORGO_WORKSPACE_ID?.trim() || null, dev: true };
  return { userId, email: "", name: "", plan: "", workspaceId: null };
}

async function ownerContext(userId: string): Promise<DbStore> {
  const store = new DbStore(userId);
  await primeConnection(sessionFor(userId));
  refreshOwner(store);
  return store;
}

// ------------------------------------------------------------------ timing

/** Every time rule the automation has: its own repeat plus timer triggers. */
export function timeRules(a: Pick<AutomationRecord, "repeat" | "triggers">): RepeatRule[] {
  const rules: RepeatRule[] = [];
  if (a.repeat) rules.push(a.repeat);
  for (const t of a.triggers) if (t.type === "timer") rules.push(t.rule);
  return rules;
}

/** The next due time strictly after `afterMs`, across all time rules. */
export function computeNext(a: Pick<AutomationRecord, "repeat" | "triggers" | "timezone" | "endsAt" | "createdAt">, afterMs: number): number | null {
  let best: number | null = null;
  const endsAtMs = a.endsAt ? Date.parse(a.endsAt) : null;
  const anchorMs = a.createdAt ? Date.parse(a.createdAt) : afterMs;
  for (const rule of timeRules(a)) {
    const n = nextRun(rule, a.timezone, afterMs, { endsAtMs, anchorMs });
    if (n !== null && (best === null || n < best)) best = n;
  }
  return best;
}

export const hasPolling = (a: Pick<AutomationRecord, "triggers">) => a.triggers.some((t) => t.type === "rss");

// ------------------------------------------------------------------ prompts

const TRIGGER_WORDS: Record<RunTrigger, string> = {
  schedule: "its schedule",
  webhook: "a webhook call",
  rss: "new items in an RSS feed",
  email: "an incoming email",
  app: "an app event",
  test: "a test run",
  retry: "a retry",
};

function buildPrompt(a: AutomationRecord, trigger: RunTrigger, event: unknown): string {
  const w = wallClock(Date.now(), a.timezone);
  const local = `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")} (${a.timezone})`;
  const parts = [`Automation "${a.name}" was started by ${TRIGGER_WORDS[trigger]} at ${local}.`, "", a.prompt.trim()];
  if (event !== undefined && event !== null) {
    let json = JSON.stringify(event, null, 2);
    if (json.length > 12_000) json = `${json.slice(0, 12_000)}\n... (cut)`;
    parts.push("", "Event data:", "```json", json, "```");
  }
  parts.push("", "When you are done, end with a short summary of the result (two or three sentences).");
  return parts.join("\n");
}

const markerOf = (text: string) => text.slice(0, 160);

// ------------------------------------------------------------------ starting

interface Started {
  taskId: string;
  startSeq: number;
}

async function startAgent(a: AutomationRecord, prompt: string): Promise<Started> {
  const store = await ownerContext(a.userId);
  const target = hermesTarget(a.userId);
  if (target.kind === "missing") throw new Error(target.reason);
  if (a.runIn === "same" && a.taskId) {
    const runtime = await runtimeFor(store, a.taskId).catch(() => null);
    if (runtime) {
      const events = await runtime.allEvents();
      const startSeq = events.at(-1)?.seq ?? 0;
      await runtime.queueMessage(prompt);
      return { taskId: a.taskId, startSeq };
    }
  }
  const task = await createTask(store, { prompt, mode: isModeId(a.mode) ? a.mode : "standard", projectId: a.projectId, connectors: a.connectors.length ? a.connectors : undefined });
  await changeTask(store, task.id, { title: a.name }).catch(() => undefined);
  await patchAutomationById(a.id, { taskId: task.id });
  return { taskId: task.id, startSeq: 0 };
}

/** Starts the agent for a run row that is already `running`. Failures go through the normal failure path. */
async function launch(a: AutomationRecord, run: RunRecord): Promise<RunRecord> {
  const event = run.payload.event;
  const prompt = buildPrompt(a, run.trigger, event);
  try {
    const started = await startAgent(a, prompt);
    const payload = { ...run.payload, startSeq: started.startSeq, marker: markerOf(prompt) };
    await updateRun(run.id, { taskId: started.taskId, payload });
    return { ...run, taskId: started.taskId, payload };
  } catch (err) {
    const error = errorText(err);
    console.warn(`[automations] could not start ${a.id}:`, error);
    await finishRun(run, { status: "failed", error });
    return { ...run, status: "failed", error };
  }
}

export interface FireOptions {
  trigger: RunTrigger;
  event?: unknown;
  scheduledFor?: string | null;
}

/** Records a run and starts it. Null when that slot already has a run (another tick won). */
export async function fireAutomation(a: AutomationRecord, opts: FireOptions): Promise<RunRecord | null> {
  const run = await insertRun({
    automationId: a.id,
    userId: a.userId,
    status: "running",
    trigger: opts.trigger,
    scheduledFor: opts.scheduledFor ?? null,
    payload: opts.event === undefined ? {} : { event: opts.event },
  });
  if (!run) return null;
  return launch(a, run);
}

// ------------------------------------------------------------------ following

interface Outcome {
  status: Exclude<RunStatus, "queued" | "running">;
  summary?: string | null;
  error?: string | null;
}

function readOutcome(events: AgentEvent[], marker: string | undefined): Outcome | null {
  // Only events from this run's own message on: in "same task" mode an earlier run may end after we queued.
  let from = 0;
  if (marker) {
    const i = events.findIndex((e) => e.type === "user.message" && e.text.startsWith(marker));
    if (i < 0) return null;
    from = i + 1;
  }
  let lastText = "";
  for (let i = from; i < events.length; i++) {
    const e = events[i];
    if (e.type === "message.completed" && e.text.trim()) lastText = e.text.trim();
    if (e.type === "run.completed") return { status: "completed", summary: summarize(lastText) };
    if (e.type === "run.failed") return { status: "failed", error: e.error.slice(0, 1000), summary: lastText ? summarize(lastText) : null };
    if (e.type === "status" && e.status === "stopped") return { status: "stopped", summary: lastText ? summarize(lastText) : null };
  }
  return null;
}

/** The last paragraph or two of the agent's final message, cut to ~400 characters. */
export function summarize(input: string): string {
  let text = input;
  // Prefer the agent's own "Summary:" line when it wrote one (the run prompt asks for it).
  const marked = text.match(/(?:^|\n|\s)\**summary\**:\s*([\s\S]+)$/i);
  if (marked && marked[1].trim().length > 20) text = marked[1];
  const clean = text.replace(/```[\s\S]*?```/g, "").replace(/[#*_`>]/g, "").replace(/\n{2,}/g, "\n\n").trim();
  if (!clean) return "Finished.";
  const paras = clean.split(/\n\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const tail = paras.slice(-2).join(" ");
  const pick = tail.length >= 60 ? tail : clean.replace(/\s+/g, " ");
  return pick.length > 400 ? `${pick.slice(0, 397).replace(/\s+\S*$/, "")}…` : pick;
}

/** Checks one running run; finishes it when its task has an outcome. */
export async function checkRun(run: RunRecord): Promise<RunStatus> {
  const age = Date.now() - Date.parse(run.startedAt);
  if (!run.taskId) {
    if (age > 5 * 60_000) await finishRun(run, { status: "failed", error: "The run never started." });
    return "running";
  }
  const store = await ownerContext(run.userId);
  const got = await getTask(store, run.taskId);
  if (!got) {
    await finishRun(run, { status: "failed", error: "The task for this run was deleted." });
    return "failed";
  }
  const startSeq = Number(run.payload.startSeq ?? 0);
  const outcome = readOutcome(
    got.events.filter((e) => e.seq > startSeq),
    typeof run.payload.marker === "string" ? run.payload.marker : undefined,
  );
  if (outcome) {
    await finishRun(run, outcome);
    return outcome.status;
  }
  if (age > RUN_TIMEOUT_MS) {
    const runtime = await runtimeFor(store, run.taskId).catch(() => null);
    await runtime?.stop().catch(() => undefined);
    await finishRun(run, { status: "failed", error: got.task.status === "waiting" ? "The run waited too long for an answer in its task." : "The run took longer than 2 hours and was stopped." });
    return "failed";
  }
  return "running";
}

/** Closes a run (once: compare-and-set from `running`), then does the bookkeeping. */
export async function finishRun(run: RunRecord, outcome: Outcome): Promise<void> {
  const won = await updateRun(run.id, { status: outcome.status, summary: outcome.summary ?? null, error: outcome.error ?? null, finishedAt: new Date().toISOString() }, "running");
  if (!won) return;
  const a = await getAutomation(run.userId, run.automationId);
  if (!a) return;
  if (outcome.status === "completed") {
    if (a.failureCount) await patchAutomationById(a.id, { failureCount: 0 });
    return;
  }
  if (outcome.status !== "failed" || run.trigger === "test") return;

  if (run.attempt < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS_MIN[Math.min(run.attempt - 1, RETRY_DELAYS_MIN.length - 1)];
    await insertRun({
      automationId: a.id,
      userId: a.userId,
      status: "queued",
      trigger: run.trigger,
      attempt: run.attempt + 1,
      scheduledFor: run.scheduledFor,
      retryAt: new Date(Date.now() + delay * 60_000).toISOString(),
      payload: run.payload.event === undefined ? {} : { event: run.payload.event },
    });
    return;
  }
  const failures = a.failureCount + 1;
  if (failures >= PAUSE_AFTER_FAILURES && a.enabled) {
    const reason = `Paused after ${failures} failed runs in a row. Last error: ${(outcome.error ?? "unknown").slice(0, 200)}`;
    await patchAutomationById(a.id, { failureCount: failures, enabled: false, pausedReason: reason });
    await createNotification(a.userId, { kind: "automation", title: `Automation paused: ${a.name}`, body: reason, link: "/app/automations?tab=manage" }).catch(() => undefined);
  } else {
    await patchAutomationById(a.id, { failureCount: failures });
  }
}

/** Starts a queued retry once it is due (compare-and-set from `queued`). */
async function startQueued(run: RunRecord): Promise<boolean> {
  if (run.retryAt && Date.parse(run.retryAt) > Date.now()) return false;
  const a = await getAutomation(run.userId, run.automationId);
  if (!a || !a.enabled) {
    await updateRun(run.id, { status: "stopped", error: a ? "The automation was paused." : "The automation was deleted.", finishedAt: new Date().toISOString() }, "queued");
    return false;
  }
  const won = await updateRun(run.id, { status: "running", startedAt: new Date().toISOString() }, "queued");
  if (!won) return false;
  await launch(a, { ...run, status: "running" });
  return true;
}

// ------------------------------------------------------------------ feeds

interface FeedState {
  seen?: string[];
  primed?: boolean;
  errors?: number;
  lastError?: string | null;
  lastPolledAt?: string;
}

async function pollFeeds(a: AutomationRecord, minInterval: number): Promise<number> {
  const state: Record<string, unknown> = { ...a.triggerState };
  let fired = 0;
  for (const t of a.triggers) {
    if (t.type !== "rss") continue;
    const s: FeedState = { ...((state[t.id] as FeedState | undefined) ?? {}) };
    try {
      const items = await fetchFeed(t.url);
      const seen = new Set(s.seen ?? []);
      const fresh: FeedItem[] = s.primed ? items.filter((i) => i.id && !seen.has(i.id)) : [];
      s.seen = [...items.map((i) => i.id), ...(s.seen ?? [])].filter((v, i, arr) => v && arr.indexOf(v) === i).slice(0, 300);
      s.primed = true;
      s.errors = 0;
      s.lastError = null;
      const matching = fresh.filter((i) => allConditionsHold(t.conditions, i));
      if (matching.length) {
        const run = await fireAutomation(a, { trigger: "rss", event: { feed: t.url, items: matching.slice(0, 10) } });
        if (run) fired++;
      }
    } catch (err) {
      s.errors = (s.errors ?? 0) + 1;
      s.lastError = errorText(err).slice(0, 300);
    }
    s.lastPolledAt = new Date().toISOString();
    state[t.id] = s;
    if ((s.errors ?? 0) >= 5) {
      const reason = `Paused: the feed ${t.url} failed 5 checks in a row (${s.lastError}).`;
      await patchAutomationById(a.id, { triggerState: state, enabled: false, pausedReason: reason });
      await createNotification(a.userId, { kind: "automation", title: `Automation paused: ${a.name}`, body: reason, link: "/app/automations?tab=manage" }).catch(() => undefined);
      return fired;
    }
  }
  void minInterval;
  await patchAutomationById(a.id, { triggerState: state });
  return fired;
}

// ------------------------------------------------------------------ the tick

export interface TickResult {
  at: string;
  fired: { automationId: string; runId: string }[];
  skipped: number;
  polled: number;
  retried: number;
  checked: number;
  finished: number;
  errors: string[];
}

/** One pass of the clock. Safe to call concurrently and as often as you like. */
export async function tick(): Promise<TickResult> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const result: TickResult = { at: nowIso, fired: [], skipped: 0, polled: 0, retried: 0, checked: 0, finished: 0, errors: [] };
  const note = (where: string) => (err: unknown) => {
    result.errors.push(`${where}: ${errorText(err)}`);
  };

  // 1. Due schedules.
  const due = await dueAutomations(nowIso).catch((err) => (note("due")(err), []));
  await Promise.all(
    due.map(async (a) => {
      try {
        if (!a.nextRunAt) return;
        const slot = a.nextRunAt;
        const next = computeNext(a, now);
        const claimed = await claimColumn(a.id, "next_run_at", slot, next === null ? null : new Date(next).toISOString(), { last_run_at: nowIso });
        if (!claimed) return void result.skipped++;
        // A slot more than 6 hours late (the clock was off) is skipped rather than run out of context.
        if (now - Date.parse(slot) > 6 * 60 * 60_000) return void result.skipped++;
        const run = await fireAutomation(a, { trigger: "schedule", scheduledFor: slot });
        if (run) result.fired.push({ automationId: a.id, runId: run.id });
        else result.skipped++;
      } catch (err) {
        note(`fire ${a.id}`)(err);
      }
    }),
  );

  // 2. Feed polling.
  const pollable = await pollableAutomations(nowIso).catch((err) => (note("poll")(err), []));
  await Promise.all(
    pollable.map(async (a) => {
      try {
        if (!a.pollAt) return;
        const claimed = await claimColumn(a.id, "poll_at", a.pollAt, hasPolling(a) ? new Date(now + POLL_EVERY_MIN * 60_000).toISOString() : null);
        if (!claimed || !hasPolling(a)) return;
        result.polled++;
        const fired = await pollFeeds(a, POLL_EVERY_MIN);
        if (fired) result.fired.push({ automationId: a.id, runId: "rss" });
      } catch (err) {
        note(`poll ${a.id}`)(err);
      }
    }),
  );

  // 3. Open runs: start due retries, follow running ones.
  const open = await openRuns().catch((err) => (note("runs")(err), []));
  await Promise.all(
    open.map(async (run) => {
      try {
        if (run.status === "queued") {
          if (await startQueued(run)) result.retried++;
          return;
        }
        result.checked++;
        const status = await checkRun(run);
        if (status !== "running") result.finished++;
      } catch (err) {
        note(`run ${run.id}`)(err);
      }
    }),
  );
  return result;
}
