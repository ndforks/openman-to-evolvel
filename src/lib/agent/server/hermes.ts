// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Server-side client for the Hermes Agent API server (Nous Research), runs API.
 *
 * Wire facts come from the Hermes docs and `gateway/platforms/api_server_runs.py` (v0.23.2):
 * - POST /v1/runs {input, session_id, model, provider, model_options} -> 202 {run_id, status}
 * - GET  /v1/runs/{id}/events is SSE; each frame is `id: <seq>` + `data: {"event": "<name>", ...}`
 *   and a reconnect resumes with `Last-Event-ID`.
 * - POST /v1/runs/{id}/stop | /steer {text} | /approval | /clarify
 */
import { createParser } from "eventsource-parser";
import type { ModeId } from "@/config/brand";
import { modelFor, type Effort, type Speed } from "@/lib/agent/types";

export interface HermesConfig {
  baseUrl: string;
  apiKey: string;
}

/** Read at call time so the values can appear in `.env.local` after this module was first loaded. */
export function hermesConfig(): HermesConfig | null {
  const raw = process.env.HERMES_BASE_URL?.trim();
  if (!raw) return null;
  // Accept the server root, or the same URL with a trailing `/v1`.
  const baseUrl = raw.replace(/\/+$/, "").replace(/\/v1$/, "");
  return { baseUrl, apiKey: process.env.HERMES_API_KEY?.trim() ?? "" };
}

export class HermesError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** One event from the runs stream. `event` names the kind; other fields depend on it. */
export interface HermesEvent {
  event: string;
  run_id?: string;
  timestamp?: number;
  seq?: number;
  [field: string]: unknown;
}

export interface HermesRunStatus {
  run_id: string;
  status: string;
  session_id?: string;
  output?: string;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  /** Present when the gateway runs the canonical session authority; approvals and clarify answers must echo it. */
  execution_generation?: number;
  pending_controls?: Record<string, unknown>[];
  [field: string]: unknown;
}

export const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled", "interrupted"]);

/** Model fields sent with every run. All runs use high reasoning effort; `fast` adds the priority service tier. */
export function runModelFields(mode: ModeId, effort?: Effort, speed?: Speed, model?: string) {
  return {
    provider: "anthropic",
    model: model ?? modelFor(mode, effort),
    model_options: {
      reasoning_effort: "high",
      ...(speed === "fast" ? { service_tier: "priority" } : {}),
    },
  };
}

function headers(cfg: HermesConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    ...extra,
  };
}

async function toError(res: Response): Promise<HermesError> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 500) || res.statusText;
  let code: string | undefined;
  try {
    const body = JSON.parse(text) as { error?: { message?: string; code?: string } | string };
    if (typeof body.error === "string") message = body.error;
    else if (body.error) {
      message = body.error.message ?? message;
      code = body.error.code ?? undefined;
    }
  } catch {
    // Not JSON; keep the raw text.
  }
  return new HermesError(`Hermes ${res.status}: ${message}`, res.status, code);
}

async function postJson<T>(cfg: HermesConfig, path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: headers(cfg, { "Content-Type": "application/json", ...extraHeaders }),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res);
  return (await res.json().catch(() => ({}))) as T;
}

export interface StartRunInput {
  input: string;
  sessionId: string;
  mode: ModeId;
  effort?: Effort;
  speed?: Speed;
  /** Overrides the model the mode maps to (used when that model is not available on the key). */
  model?: string;
  /** Extra system guidance layered on top of Hermes' own prompt. */
  instructions?: string;
  /** Makes a retried start return the original run instead of creating a second one. */
  idempotencyKey?: string;
}

export async function startRun(cfg: HermesConfig, input: StartRunInput): Promise<{ runId: string }> {
  const body = {
    input: input.input,
    session_id: input.sessionId,
    ...(input.instructions ? { instructions: input.instructions } : {}),
    ...runModelFields(input.mode, input.effort, input.speed, input.model),
  };
  const extra = input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await postJson<{ run_id?: string }>(cfg, "/v1/runs", body, extra);
      if (!res.run_id) throw new HermesError("Hermes did not return a run id.", 502);
      return { runId: res.run_id };
    } catch (err) {
      lastError = err;
      // Retry only what is safe to retry: network failures and "busy, come back" answers.
      const retryable = !(err instanceof HermesError) || err.status === 503 || err.status === 502;
      if (!retryable || !input.idempotencyKey) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function getRun(cfg: HermesConfig, runId: string): Promise<HermesRunStatus | null> {
  const res = await fetch(`${cfg.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
    headers: headers(cfg),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await toError(res);
  return (await res.json()) as HermesRunStatus;
}

export async function stopRun(cfg: HermesConfig, runId: string): Promise<void> {
  await postJson(cfg, `/v1/runs/${encodeURIComponent(runId)}/stop`, {});
}

/**
 * Injects guidance into a live run. Hermes delivers it at the next tool boundary.
 * Returns false when the run is not accepting steer text (finished, stopping, or paused on an approval).
 */
export async function steerRun(cfg: HermesConfig, runId: string, text: string): Promise<boolean> {
  try {
    await postJson(cfg, `/v1/runs/${encodeURIComponent(runId)}/steer`, { text });
    return true;
  } catch (err) {
    if (err instanceof HermesError && (err.status === 409 || err.status === 404)) return false;
    throw err;
  }
}

/**
 * Approval and clarify answers. Under the canonical session authority the body must be exactly
 * `{request_id, execution_generation, choice|answer}`; the legacy mode takes `{request_id, choice}`.
 * The run status tells the two apart, so it is read first when the caller has no generation.
 */
async function respondControl(
  cfg: HermesConfig,
  runId: string,
  kind: "approval" | "clarify",
  requestId: string | undefined,
  value: string,
  generation?: number,
): Promise<void> {
  let gen = generation;
  if (gen === undefined) {
    const status = await getRun(cfg, runId).catch(() => null);
    if (typeof status?.execution_generation === "number") gen = status.execution_generation;
  }
  const field = kind === "approval" ? "choice" : "answer";
  const body: Record<string, unknown> = { [field]: value };
  // Legacy approvals may omit the id (Hermes then resolves the oldest pending one).
  if (requestId !== undefined) body.request_id = requestId;
  if (gen !== undefined) body.execution_generation = gen;
  await postJson(cfg, `/v1/runs/${encodeURIComponent(runId)}/${kind}`, body);
}

export function respondApproval(cfg: HermesConfig, runId: string, requestId: string | undefined, choice: string, generation?: number) {
  return respondControl(cfg, runId, "approval", requestId, choice, generation);
}

export function respondClarify(cfg: HermesConfig, runId: string, requestId: string, answer: string, generation?: number) {
  return respondControl(cfg, runId, "clarify", requestId, answer, generation);
}

interface TranscriptMessage {
  id?: string | number;
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  reasoning?: unknown;
  reasoning_content?: unknown;
  tool_calls?: { id?: string; call_id?: string; function?: { name?: string; arguments?: unknown } }[] | null;
}

/** The newest messages of a session transcript, newest first. Undefined when the transcript cannot be read. */
async function recentMessages(cfg: HermesConfig, sessionId: string, limit: number, timeoutMs: number): Promise<TranscriptMessage[] | undefined> {
  const url = `${cfg.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}&order=latest`;
  try {
    const res = await fetch(url, { headers: headers(cfg), signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { data?: TranscriptMessage[] };
    return Array.isArray(body.data) ? body.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The full result of one tool call, read from the session transcript.
 *
 * Needed because a gateway running the canonical session authority (the default in 0.23) sends
 * `tool.completed` with an empty `preview`; the transcript is written as the run goes, so the
 * result is there by the time the event arrives. Returns undefined when it cannot be found.
 */
export async function getToolResult(cfg: HermesConfig, sessionId: string, toolCallId: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = await recentMessages(cfg, sessionId, 20, 3000);
    if (!messages) return undefined;
    const hit = messages.find((m) => m.role === "tool" && m.tool_call_id === toolCallId);
    if (hit) return typeof hit.content === "string" ? hit.content : JSON.stringify(hit.content ?? "");
    await new Promise((r) => setTimeout(r, 350));
  }
  return undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** One model step that asked for tools: its reasoning summary and the calls it made, with their arguments. */
export interface HermesStep {
  messageId: string;
  reasoning?: string;
  calls: { id: string; tool: string; args: Record<string, unknown> }[];
}

/**
 * The model step that issued `toolCallId`, read from the session transcript.
 *
 * The runs stream carries neither reasoning nor tool arguments (the runs route of a gateway on the
 * canonical session authority subscribes to text and tool boundaries only), but the transcript has
 * both as soon as the model's answer is complete, which is just before the tool starts.
 */
export async function getStep(cfg: HermesConfig, sessionId: string, toolCallId: string): Promise<HermesStep | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = await recentMessages(cfg, sessionId, 12, 1500);
    if (!messages) return undefined;
    const hit = messages.find((m) => m.role === "assistant" && m.tool_calls?.some((c) => (c.id ?? c.call_id) === toolCallId));
    if (hit) {
      const calls = (hit.tool_calls ?? []).flatMap((c) => {
        const id = c.id ?? c.call_id;
        if (!id) return [];
        let args: Record<string, unknown> = {};
        try {
          const raw = c.function?.arguments;
          const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (isRecord(parsed)) args = parsed;
        } catch {
          // Arguments that are not JSON are left out.
        }
        const tool = c.function?.name ?? "tool";
        // Tools loaded on demand are called through `tool_call`, which wraps the real call or calls;
        // the stream names the real tool, so the wrapper is taken off here.
        if (tool === "tool_call" && Array.isArray(args.calls)) {
          const inner = args.calls.filter(isRecord).map((call) => ({
            id,
            tool: typeof call.name === "string" ? call.name : "tool",
            args: isRecord(call.arguments) ? call.arguments : {},
          }));
          if (inner.length) return inner;
        }
        return [{ id, tool, args }];
      });
      const text = typeof hit.reasoning === "string" ? hit.reasoning : typeof hit.reasoning_content === "string" ? hit.reasoning_content : "";
      return { messageId: String(hit.id ?? toolCallId), ...(text.trim() ? { reasoning: text.trim() } : {}), calls };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}

/** Hermes sends a keepalive comment every 10 s; this much silence means the connection is dead. */
const STREAM_IDLE_MS = 60_000;

/**
 * Streams a run's events until Hermes closes the stream. Pass `lastSeq` to resume after a drop.
 * Throws on connection or HTTP errors; the caller decides whether to reconnect.
 */
export async function* streamRunEvents(
  cfg: HermesConfig,
  runId: string,
  opts: { lastSeq?: number; signal?: AbortSignal } = {},
): AsyncGenerator<HermesEvent> {
  const idle = new AbortController();
  const signal = opts.signal ? AbortSignal.any([opts.signal, idle.signal]) : idle.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(new Error("Hermes event stream went silent.")), STREAM_IDLE_MS);
  };

  touch();
  try {
    const res = await fetch(`${cfg.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`, {
      headers: headers(cfg, {
        Accept: "text/event-stream",
        ...(opts.lastSeq !== undefined && opts.lastSeq >= 0 ? { "Last-Event-ID": String(opts.lastSeq) } : {}),
      }),
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw await toError(res);
    if (!res.body) throw new HermesError("Hermes returned an empty event stream.", 502);

    const pending: HermesEvent[] = [];
    const parser = createParser({
      onEvent(message) {
        if (!message.data) return;
        try {
          const parsed = JSON.parse(message.data) as HermesEvent;
          if (typeof parsed.event !== "string" && message.event) parsed.event = message.event;
          if (typeof parsed.seq !== "number" && message.id !== undefined && /^\d+$/.test(message.id)) parsed.seq = Number(message.id);
          if (typeof parsed.event === "string") pending.push(parsed);
        } catch {
          // Ignore frames that are not JSON.
        }
      },
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        touch();
        parser.feed(decoder.decode(value, { stream: true }));
        while (pending.length) yield pending.shift()!;
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Hermes' compaction summaries start with one of these (see `agent/context_compressor.py`). */
const COMPACTION_PREFIX = /^\s*\[CONTEXT (COMPACTION|SUMMARY)/;

/**
 * How many times Hermes compacted a session, and the newest summary, read from the transcript with compacted rows
 * included. Undefined when the transcript cannot be read.
 */
export async function getCompactions(cfg: HermesConfig, sessionId: string): Promise<{ count: number; summary?: string } | undefined> {
  const url = `${cfg.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=400&order=latest&include_compacted=true&inline_images=false`;
  try {
    const res = await fetch(url, { headers: headers(cfg), signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { data?: TranscriptMessage[] };
    const hits = (body.data ?? []).filter((m) => typeof m.content === "string" && COMPACTION_PREFIX.test(m.content));
    const newest = hits[0]?.content as string | undefined;
    const summary = newest?.replace(/^\s*\[[^\]]*\][^\n]*\n?/, "").trim();
    return { count: hits.length, ...(summary ? { summary } : {}) };
  } catch {
    return undefined;
  }
}

/** Copies a session (all its messages) to a new one with id `newId` (Hermes' `/api/sessions/{id}/fork`). The source keeps working. */
export async function forkSession(cfg: HermesConfig, sessionId: string, newId: string, title?: string): Promise<void> {
  await postJson(cfg, `/api/sessions/${encodeURIComponent(sessionId)}/fork`, { id: newId, ...(title ? { title: title.slice(0, 90) } : {}) });
}
