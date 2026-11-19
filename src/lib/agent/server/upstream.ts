/**
 * What the relay needs from an agent backend. Two implementations speak it: the real Hermes
 * API server and a scripted mock that emits the same event shapes, so one relay serves both.
 */
import {
  forkSession,
  getCompactions,
  getRun,
  getStep,
  getToolResult,
  respondApproval,
  respondClarify,
  startRun,
  steerRun,
  stopRun,
  streamRunEvents,
  type HermesEvent,
  type HermesRunStatus,
  type HermesStep,
  type StartRunInput,
} from "./hermes";
import { mockUpstream } from "./mock";
import { hermesTarget } from "./connection";

export interface Upstream {
  readonly kind: "hermes" | "mock";
  start(input: StartRunInput): Promise<{ runId: string }>;
  events(runId: string, opts: { lastSeq?: number; signal?: AbortSignal }): AsyncIterable<HermesEvent>;
  status(runId: string): Promise<HermesRunStatus | null>;
  stop(runId: string): Promise<void>;
  /** Resolves false when the run is not accepting steer text right now. */
  steer(runId: string, text: string): Promise<boolean>;
  approval(runId: string, requestId: string | undefined, choice: string, generation?: number): Promise<void>;
  clarify(runId: string, requestId: string, answer: string, generation?: number): Promise<void>;
  /** Full result text of a finished tool call, for backends whose events carry no result preview. */
  toolResult?(sessionId: string, toolCallId: string): Promise<string | undefined>;
  /** The model step behind a tool call (reasoning summary, arguments), for backends that keep a transcript. */
  step?(sessionId: string, toolCallId: string): Promise<HermesStep | undefined>;
  /** Compactions recorded in a session's transcript and the newest summary. */
  compactions?(sessionId: string): Promise<{ count: number; summary?: string } | undefined>;
  /** Copies a session to a new id (used by Branch). */
  fork?(sessionId: string, newId: string, title?: string): Promise<void>;
}

/** Stands in when a user has no agent computer: every run fails at once with `reason`. */
function unavailableUpstream(reason: string): Upstream {
  const refuse = async (): Promise<never> => {
    throw new Error(reason);
  };
  return {
    kind: "mock",
    start: refuse,
    events: async function* () {
      throw new Error(reason);
    },
    status: async () => null,
    stop: async () => undefined,
    steer: async () => false,
    approval: refuse,
    clarify: refuse,
  };
}

/**
 * The owner's Hermes server (their account's, or the env one for the dev user and the file
 * store), the mock when the dev setup has no Hermes. Decided per run.
 *
 * `profile` names a secondary Hermes profile on the same server (reached at `/p/<profile>/...`, with the
 * same key): tasks given another computer run in the `om-remote` profile (see `remote.ts`).
 */
export function pickUpstream(ownerId: string, preferred?: "hermes" | "mock", profile?: string): Upstream {
  const target = hermesTarget(ownerId);
  if (target.kind === "missing") return unavailableUpstream(target.reason);
  if (target.kind === "mock" || preferred === "mock") return mockUpstream;
  const cfg = profile ? { ...target.cfg, baseUrl: `${target.cfg.baseUrl}/p/${encodeURIComponent(profile)}` } : target.cfg;
  return {
    kind: "hermes",
    start: (input) => startRun(cfg, input),
    events: (runId, opts) => streamRunEvents(cfg, runId, opts),
    status: (runId) => getRun(cfg, runId),
    stop: (runId) => stopRun(cfg, runId),
    steer: (runId, text) => steerRun(cfg, runId, text),
    approval: (runId, requestId, choice, generation) => respondApproval(cfg, runId, requestId, choice, generation),
    clarify: (runId, requestId, answer, generation) => respondClarify(cfg, runId, requestId, answer, generation),
    toolResult: (sessionId, toolCallId) => getToolResult(cfg, sessionId, toolCallId),
    step: (sessionId, toolCallId) => getStep(cfg, sessionId, toolCallId),
    compactions: (sessionId) => getCompactions(cfg, sessionId),
    fork: (sessionId, newId, title) => forkSession(cfg, sessionId, newId, title),
  };
}

export function isMockMode(ownerId = "local"): boolean {
  return hermesTarget(ownerId).kind === "mock";
}
