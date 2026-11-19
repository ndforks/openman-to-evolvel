/**
 * Pure reducer that turns the stored and streamed `AgentEvent`s of one task into the view model the task screen renders.
 * No React, no browser APIs: everything here can be unit tested with plain objects (see `reducer.test.ts`).
 *
 * Shape of the view model:
 * - the conversation is a list of turns: a user bubble, then one agent turn holding everything the agent did in reply;
 * - an agent turn is a list of blocks in arrival order: narration text, groups of tool calls (the work log),
 *   plan step markers, question and approval cards, delivered files and errors;
 * - tool calls also live in one flat, ordered list so the computer panel can scrub through them.
 */
import type { AgentEvent, Interaction, TaskReference, TaskStatus } from "@/lib/agent/types";

export type SendMode = "steer" | "queue" | "interrupt";
export type StepStatus = "pending" | "active" | "done";

export interface PlanStep {
  title: string;
  status: StepStatus;
}

export interface ToolCall {
  callId: string;
  tool: string;
  /** Preview sent when the call started: the command, query, path or a short description. */
  input?: string;
  /** Preview sent when the call finished: usually a slice of the result. */
  output?: string;
  state: "running" | "done" | "error";
  seq: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface TaskFile {
  fileId: string;
  name: string;
  mime?: string;
  size?: number;
  at: string;
}

export type TextBlock = { kind: "text"; id: string; at: string; text: string; streaming: boolean };
export type ToolsBlock = { kind: "tools"; id: string; at: string; callIds: string[] };
export type StepBlock = { kind: "step"; id: string; at: string; title: string };
export type QuestionBlock = { kind: "question"; id: string; at: string; requestId: string; text: string; options?: string[]; multiple?: boolean; answer?: string; skipped?: boolean };
export type ApprovalBlock = { kind: "approval"; id: string; at: string; requestId: string; approvalKind: string; title: string; detail?: string; choices: string[]; choice?: string; skipped?: boolean };
export type FilesBlock = { kind: "files"; id: string; at: string; fileIds: string[] };
export type ErrorBlock = { kind: "error"; id: string; at: string; message: string };
/** A line in the work log about the task itself, such as Hermes compacting the context. */
export type NoticeBlock = { kind: "notice"; id: string; at: string; notice: "compacted"; detail?: string };
export type Block = TextBlock | ToolsBlock | StepBlock | QuestionBlock | ApprovalBlock | FilesBlock | ErrorBlock | NoticeBlock;

/** A divider between turns: where a branch or continuation starts, or where the task changed mode. */
export interface Marker {
  id: string;
  at: string;
  /** Drawn after this many turns. */
  afterTurns: number;
  kind: "branched" | "inherited" | "interaction";
  fromTaskId?: string;
  fromTitle?: string;
  interaction?: Interaction;
}

export type TurnState = "running" | "waiting" | "completed" | "stopped" | "error";

export interface UserTurn {
  kind: "user";
  id: string;
  at: string;
  text: string;
  /** Shown optimistically; the server has not echoed it yet. */
  pending?: boolean;
  /** Earlier tasks this message referred to. */
  references?: TaskReference[];
  /** Sequence number of the event that recorded it (absent while optimistic). */
  seq?: number;
}

export interface AgentTurn {
  kind: "agent";
  id: string;
  /** Time of the first event of the turn; the "Working for" counter starts here. */
  at: string;
  endedAt?: string;
  state: TurnState;
  blocks: Block[];
  usage?: { inputTokens: number; outputTokens: number };
}

export type Turn = UserTurn | AgentTurn;

export interface QueuedMessage {
  id: string;
  text: string;
  at: string;
}

export interface TaskViewModel {
  /** Highest `seq` applied so far. Events at or below it are ignored, so replays after a reconnect are harmless. */
  lastSeq: number;
  status: TaskStatus;
  /** Short status text from the backend, when it sent one. */
  brief?: string;
  turns: Turn[];
  plan: PlanStep[];
  calls: Record<string, ToolCall>;
  /** Call ids in start order. */
  callOrder: string[];
  files: Record<string, TaskFile>;
  fileOrder: string[];
  /** True while reasoning deltas are arriving and nothing visible has followed them yet. */
  thinking: boolean;
  reasoning: string;
  /** Messages sent with "Add to queue" that the server has not started on yet. */
  queued: QueuedMessage[];
  error?: string;
  /** Dividers between turns (branch, continuation, mode switch). */
  markers: Marker[];
  /** How the agent works on the task, once the stream said so. */
  interaction?: Interaction;
  /** References waiting for the user message they belong to. */
  pendingRefs?: TaskReference[];
  /** Hermes compacted the context at least once: the task is long. */
  compacted: boolean;
}

export type TaskAction =
  | { type: "event"; event: AgentEvent }
  | { type: "events"; events: AgentEvent[] }
  | { type: "local.user"; id: string; text: string; mode: SendMode; at: string }
  | { type: "local.unqueue"; id: string }
  | { type: "local.resolved"; requestId: string; value: string }
  | { type: "local.status"; status: TaskStatus; at?: string }
  | { type: "reset" };

export function initialState(): TaskViewModel {
  return {
    lastSeq: -1,
    status: "waking",
    turns: [],
    plan: [],
    calls: {},
    callOrder: [],
    files: {},
    fileOrder: [],
    thinking: false,
    reasoning: "",
    queued: [],
    markers: [],
    compacted: false,
  };
}

/* ---------------------------------------------------------------- helpers */

export function isBusy(status: TaskStatus): boolean {
  return status === "running" || status === "waking";
}

function lastTurn(state: TaskViewModel): Turn | undefined {
  return state.turns[state.turns.length - 1];
}

function replaceTurn(turns: Turn[], index: number, turn: Turn): Turn[] {
  const next = turns.slice();
  next[index] = turn;
  return next;
}

/** Marks the streaming text block of a turn, if any, as finished. */
function closeStreaming(blocks: Block[]): Block[] {
  const i = blocks.length - 1;
  const last = blocks[i];
  if (!last || last.kind !== "text" || !last.streaming) return blocks;
  const next = blocks.slice();
  next[i] = { ...last, streaming: false };
  return next;
}

/**
 * Closes any question or approval that is still open. A user message answers a question with its text;
 * anything else (work resuming, the run ending) means the request was dealt with elsewhere.
 */
function settleRequests(blocks: Block[], answerText?: string): Block[] {
  let changed = false;
  const next = blocks.map((b): Block => {
    if (b.kind === "question" && b.answer === undefined && !b.skipped) {
      changed = true;
      return answerText !== undefined ? { ...b, answer: answerText } : { ...b, skipped: true };
    }
    // Cards the app raised (`ext:`: project changes, outbound texts) stay open until their own answer arrives.
    if (b.kind === "approval" && b.choice === undefined && !b.skipped && !b.requestId.startsWith("ext:")) {
      changed = true;
      return { ...b, skipped: true };
    }
    return b;
  });
  return changed ? next : blocks;
}

/** Appends a call to the trailing work-log group, or starts a new group. */
function addCallToBlocks(blocks: Block[], callId: string, e: { seq: number; at: string }): Block[] {
  const next = blocks.slice();
  const last = next[next.length - 1];
  if (last && last.kind === "tools") next[next.length - 1] = { ...last, callIds: [...last.callIds, callId] };
  else next.push({ kind: "tools", id: `g${e.seq}`, at: e.at, callIds: [callId] });
  return next;
}

/** Moves the files block to the end of a finished turn so the cards sit under the result message. */
function sinkFiles(blocks: Block[]): Block[] {
  const at = blocks.findIndex((b) => b.kind === "files");
  if (at < 0 || at === blocks.length - 1) return blocks;
  const next = blocks.slice();
  const [files] = next.splice(at, 1);
  next.push(files);
  return next;
}

function endTurn(turn: AgentTurn, state: TurnState, at: string): AgentTurn {
  return { ...turn, state, endedAt: at, blocks: sinkFiles(settleRequests(closeStreaming(turn.blocks))) };
}

/** Tool calls still marked running when a run ends never got their `tool.completed`; close them so nothing spins forever. */
function settleCalls(calls: Record<string, ToolCall>, at: string, failed: boolean): Record<string, ToolCall> {
  let next: Record<string, ToolCall> | null = null;
  for (const id of Object.keys(calls)) {
    const c = calls[id];
    if (c.state !== "running") continue;
    next ??= { ...calls };
    next[id] = { ...c, state: failed ? "error" : "done", completedAt: at };
  }
  return next ?? calls;
}

interface OpenTurn {
  turns: Turn[];
  turn: AgentTurn;
  index: number;
  /** Task status after taking the event into account. */
  status: TaskStatus;
}

/**
 * Finds the agent turn an event belongs to.
 * - An open turn is reused; if it was paused on a question or approval it resumes and the request is settled.
 * - After a user bubble (or on an empty task) a new turn starts.
 * - After a finished turn, late events (a trailing delta, a file saved once the run ended) attach to that turn
 *   without reopening it, unless the task has been marked busy again.
 */
function openAgentTurn(state: TaskViewModel, e: { seq: number; at: string }, resume = true): OpenTurn {
  const last = lastTurn(state);
  if (last && last.kind === "agent" && (!last.endedAt || !isBusy(state.status))) {
    const index = state.turns.length - 1;
    if (last.endedAt || last.state === "running" || !resume) return { turns: state.turns, turn: last, index, status: state.status };
    const turn: AgentTurn = { ...last, state: "running", blocks: settleRequests(last.blocks) };
    return { turns: replaceTurn(state.turns, index, turn), turn, index, status: "running" };
  }
  // The clock of a reply starts when the user asked, not when the first sign of work arrives.
  const turn: AgentTurn = { kind: "agent", id: `a${e.seq}`, at: last && last.kind === "user" ? last.at : e.at, state: "running", blocks: [] };
  const turns = [...state.turns, turn];
  return { turns, turn, index: turns.length - 1, status: isBusy(state.status) ? state.status : "running" };
}

const TURN_END: Partial<Record<TaskStatus, TurnState>> = { completed: "completed", stopped: "stopped", error: "error" };

/** Tools whose whole effect is a question card; a row for them in the work log would say the same thing twice. */
const ASK_TOOL = /clarify|ask_user|ask_question|message_ask/i;

/* ---------------------------------------------------------------- events */

export function reduceEvent(state: TaskViewModel, e: AgentEvent): TaskViewModel {
  if (e.seq <= state.lastSeq) return state;
  const base: TaskViewModel = { ...state, lastSeq: e.seq };

  switch (e.type) {
    case "user.message": {
      const text = e.text;
      const same = (other: string) => other.trim() === text.trim();
      // The echo of a message this client sent: it leaves the queue, or confirms the optimistic bubble in place.
      const queuedIndex = base.queued.findIndex((q) => same(q.text));
      const queued = queuedIndex >= 0 ? base.queued.filter((_, i) => i !== queuedIndex) : base.queued;
      const pendingIndex = queuedIndex >= 0 ? -1 : base.turns.findIndex((t) => t.kind === "user" && t.pending === true && same(t.text));
      const refs = base.pendingRefs?.length ? { references: base.pendingRefs } : {};
      if (pendingIndex >= 0) {
        const pending = base.turns[pendingIndex] as UserTurn;
        // The server's clock becomes the bubble's time, so the reply that follows is measured against one clock.
        return { ...base, turns: replaceTurn(base.turns, pendingIndex, { ...pending, ...refs, pending: false, at: e.at, seq: e.seq }), queued, thinking: false, pendingRefs: undefined };
      }
      // A new user message closes the agent turn before it and answers whatever that turn was asking.
      let turns = base.turns;
      const last = lastTurn(base);
      if (last && last.kind === "agent") {
        const blocks = settleRequests(closeStreaming(last.blocks), text);
        turns = replaceTurn(turns, turns.length - 1, last.endedAt ? { ...last, blocks } : { ...last, blocks, endedAt: e.at, state: "completed" });
      }
      turns = [...turns, { kind: "user", id: `u${e.seq}`, at: e.at, text, seq: e.seq, ...refs }];
      return { ...base, turns, queued, thinking: false, reasoning: "", pendingRefs: undefined };
    }

    case "references.added":
      return { ...base, pendingRefs: [...(base.pendingRefs ?? []), ...e.tasks] };

    case "task.branched": {
      // Closes the inherited conversation: everything before it came from the other task.
      const last = lastTurn(base);
      const turns = last && last.kind === "agent" && !last.endedAt ? replaceTurn(base.turns, base.turns.length - 1, endTurn(last, "completed", e.at)) : base.turns;
      const marker: Marker = { id: `m${e.seq}`, at: e.at, afterTurns: turns.length, kind: e.inherited ? "inherited" : "branched", fromTaskId: e.fromTaskId, fromTitle: e.fromTitle };
      return { ...base, turns, markers: [...base.markers, marker] };
    }

    case "interaction.changed": {
      const marker: Marker = { id: `m${e.seq}`, at: e.at, afterTurns: base.turns.length, kind: "interaction", interaction: e.interaction };
      return { ...base, interaction: e.interaction, markers: [...base.markers, marker] };
    }

    case "context.compacted": {
      const { turns, turn, index } = openAgentTurn(base, e, false);
      const blocks: Block[] = [...closeStreaming(turn.blocks), { kind: "notice", id: `n${e.seq}`, at: e.at, notice: "compacted", ...(e.summary ? { detail: e.summary } : {}) }];
      return { ...base, compacted: true, turns: replaceTurn(turns, index, { ...turn, blocks: turn.endedAt ? sinkFiles(blocks) : blocks }) };
    }

    case "reasoning.delta": {
      return { ...base, thinking: true, reasoning: base.thinking ? base.reasoning + e.text : e.text };
    }

    case "message.delta": {
      if (!e.text) return base;
      const { turns, turn, index, status } = openAgentTurn(base, e);
      const blocks = turn.blocks.slice();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "text" && last.streaming) blocks[blocks.length - 1] = { ...last, text: last.text + e.text };
      else {
        // Models often open a message with blank lines; they would render as an empty paragraph.
        const text = e.text.replace(/^\s+/, "");
        if (!text) return { ...base, turns, status };
        blocks.push({ kind: "text", id: `t${e.seq}`, at: e.at, text, streaming: !turn.endedAt });
      }
      return { ...base, turns: replaceTurn(turns, index, { ...turn, blocks }), status, thinking: false };
    }

    case "message.completed": {
      const { turns, turn, index, status } = openAgentTurn(base, e);
      const blocks = turn.blocks.slice();
      const last = blocks[blocks.length - 1];
      const text = e.text.trim();
      if (last && last.kind === "text" && last.streaming) blocks[blocks.length - 1] = { ...last, text: text || last.text, streaming: false };
      else if (text && !turn.blocks.some((b) => b.kind === "text" && b.text.trim() === text)) blocks.push({ kind: "text", id: `t${e.seq}`, at: e.at, text, streaming: false });
      return { ...base, turns: replaceTurn(turns, index, { ...turn, blocks: turn.endedAt ? sinkFiles(blocks) : blocks }), status, thinking: false };
    }

    case "tool.started": {
      if (ASK_TOOL.test(e.tool)) return { ...base, thinking: false };
      const { turns, turn, index, status } = openAgentTurn(base, e);
      const known = base.calls[e.callId];
      const call: ToolCall = { callId: e.callId, tool: e.tool, input: e.preview || known?.input, output: known?.output, state: turn.endedAt ? "done" : "running", seq: known?.seq ?? e.seq, startedAt: known?.startedAt ?? e.at };
      const closed = closeStreaming(turn.blocks);
      const blocks = known ? closed : addCallToBlocks(closed, e.callId, e);
      return {
        ...base,
        turns: replaceTurn(turns, index, { ...turn, blocks }),
        calls: { ...base.calls, [e.callId]: call },
        callOrder: known ? base.callOrder : [...base.callOrder, e.callId],
        status,
        thinking: false,
      };
    }

    case "tool.completed": {
      const known = base.calls[e.callId];
      // A call finishing means whatever the turn was waiting on has been answered.
      const { turns, turn, index, status } = openAgentTurn(base, e);
      if (!known && ASK_TOOL.test(e.tool)) return { ...base, turns, status, thinking: false };
      if (!known) {
        // The start was never seen (history trimmed, or the stream joined late): record the call as already finished.
        const call: ToolCall = { callId: e.callId, tool: e.tool, output: e.preview || undefined, state: e.error ? "error" : "done", seq: e.seq, startedAt: e.at, completedAt: e.at, durationMs: e.durationMs };
        const blocks = addCallToBlocks(closeStreaming(turn.blocks), e.callId, e);
        return { ...base, turns: replaceTurn(turns, index, { ...turn, blocks }), calls: { ...base.calls, [e.callId]: call }, callOrder: [...base.callOrder, e.callId], status, thinking: false };
      }
      const measured = Date.parse(e.at) - Date.parse(known.startedAt);
      const durationMs = e.durationMs ?? (Number.isFinite(measured) ? Math.max(0, measured) : undefined);
      const call: ToolCall = { ...known, output: e.preview || known.output, state: e.error ? "error" : "done", completedAt: e.at, durationMs };
      return { ...base, turns, status, calls: { ...base.calls, [e.callId]: call } };
    }

    case "plan.updated": {
      const plan: PlanStep[] = e.steps.map((s) => ({ title: s.title, status: s.status }));
      const active = plan.find((s) => s.status === "active");
      const last = lastTurn(base);
      // A plan arriving after the turn ended only updates the checklist.
      if (!active || (last && last.kind === "agent" && last.endedAt && !isBusy(base.status))) return { ...base, plan };
      // A step that just became active gets one marker in the work log.
      const { turns, turn, index, status } = openAgentTurn(base, e, false);
      if (turn.blocks.some((b) => b.kind === "step" && b.title === active.title)) return { ...base, plan, turns, status };
      const blocks: Block[] = [...closeStreaming(turn.blocks), { kind: "step", id: `s${e.seq}`, at: e.at, title: active.title }];
      return { ...base, plan, turns: replaceTurn(turns, index, { ...turn, blocks }), status };
    }

    case "question": {
      const { turns, turn, index } = openAgentTurn(base, e);
      if (turn.endedAt) return base;
      const blocks: Block[] = [...closeStreaming(turn.blocks), { kind: "question", id: `q${e.seq}`, at: e.at, requestId: e.requestId, text: e.text, options: e.options, multiple: e.multiple }];
      return { ...base, turns: replaceTurn(turns, index, { ...turn, state: "waiting", blocks }), status: "waiting", thinking: false };
    }

    case "approval.request": {
      const opened = openAgentTurn(base, e);
      // An approval raised by the app after the agent finished (an outbound text, say) gets a turn of its own.
      const { turns, turn, index } = opened.turn.endedAt ? (() => {
        const fresh: AgentTurn = { kind: "agent", id: `a${e.seq}`, at: e.at, state: "running", blocks: [] };
        const list = [...base.turns, fresh];
        return { turns: list, turn: fresh, index: list.length - 1 };
      })() : opened;
      const blocks: Block[] = [...closeStreaming(turn.blocks), { kind: "approval", id: `p${e.seq}`, at: e.at, requestId: e.requestId, approvalKind: e.kind, title: e.title, detail: e.detail, choices: e.choices }];
      return { ...base, turns: replaceTurn(turns, index, { ...turn, state: "waiting", blocks }), status: "waiting", thinking: false };
    }

    case "approval.resolved": {
      const turns = base.turns.map((t): Turn => {
        if (t.kind !== "agent" || !t.blocks.some((b) => b.kind === "approval" && b.requestId === e.requestId)) return t;
        const blocks = t.blocks.map((b): Block => (b.kind === "approval" && b.requestId === e.requestId ? { ...b, choice: e.choice, skipped: false } : b));
        return { ...t, blocks, state: t.state === "waiting" ? "running" : t.state };
      });
      return { ...base, turns };
    }

    case "file.created": {
      const file: TaskFile = { fileId: e.fileId, name: e.name, mime: e.mime, size: e.size, at: e.at };
      const files = { ...base.files, [e.fileId]: file };
      if (base.files[e.fileId]) return { ...base, files };
      const fileOrder = [...base.fileOrder, e.fileId];
      const { turns, turn, index, status } = openAgentTurn(base, e, false);
      const blocks = turn.blocks.slice();
      // Files delivered in one turn share a single block; it moves under the result message when the turn ends.
      const at = blocks.findIndex((b) => b.kind === "files");
      if (at >= 0) {
        const existing = blocks[at] as FilesBlock;
        blocks[at] = { ...existing, fileIds: [...existing.fileIds, e.fileId] };
      } else blocks.push({ kind: "files", id: `f${e.seq}`, at: e.at, fileIds: [e.fileId] });
      return { ...base, files, fileOrder, turns: replaceTurn(turns, index, { ...turn, blocks }), status };
    }

    case "status": {
      const next: TaskViewModel = { ...base, status: e.status, brief: e.brief };
      const last = lastTurn(next);
      const end = TURN_END[e.status];
      if (end) {
        if (!last || last.kind !== "agent" || last.endedAt) return { ...next, thinking: false };
        return { ...next, turns: replaceTurn(next.turns, next.turns.length - 1, endTurn(last, end, e.at)), calls: settleCalls(next.calls, e.at, e.status === "error"), thinking: false };
      }
      if (e.status === "waiting") {
        if (!last || last.kind !== "agent" || last.endedAt || last.state !== "running") return next;
        return { ...next, turns: replaceTurn(next.turns, next.turns.length - 1, { ...last, state: "waiting", blocks: closeStreaming(last.blocks) }), thinking: false };
      }
      // Busy again. A paused turn resumes; a finished one is followed by a fresh turn (a resumed or scheduled run).
      if (!last) return next;
      if (last.kind === "agent" && last.endedAt) return { ...next, turns: [...next.turns, { kind: "agent", id: `a${e.seq}`, at: e.at, state: "running", blocks: [] }] };
      if (last.kind === "agent" && last.state === "waiting") return { ...next, turns: replaceTurn(next.turns, next.turns.length - 1, { ...last, state: "running", blocks: settleRequests(last.blocks) }) };
      return next;
    }

    case "run.completed": {
      const last = lastTurn(base);
      let turns = base.turns;
      if (last && last.kind === "agent") {
        const ended = last.endedAt ? last : endTurn(last, "completed", e.at);
        turns = replaceTurn(turns, turns.length - 1, { ...ended, usage: e.usage ?? ended.usage });
      }
      // A stop or a failure that was already recorded wins over the completion event that trails it.
      const status: TaskStatus = base.status === "stopped" || base.status === "error" ? base.status : "completed";
      return { ...base, turns, status, brief: undefined, calls: settleCalls(base.calls, e.at, false), thinking: false, reasoning: "" };
    }

    case "run.failed": {
      const { turns, turn, index } = openAgentTurn(base, e, false);
      const ended = endTurn(turn, "error", turn.endedAt ?? e.at);
      const blocks: Block[] = [...ended.blocks, { kind: "error", id: `e${e.seq}`, at: e.at, message: e.error }];
      return { ...base, turns: replaceTurn(turns, index, { ...ended, blocks }), status: "error", brief: undefined, error: e.error, calls: settleCalls(base.calls, e.at, true), thinking: false };
    }

    default:
      // An event this build does not know (written by a newer server) changes nothing.
      return base;
  }
}

export function reduceEvents(state: TaskViewModel, events: AgentEvent[]): TaskViewModel {
  let next = state;
  for (const e of events) next = reduceEvent(next, e);
  return next;
}

/** Reducer for `useReducer`: server events plus the few things the client does optimistically. */
export function taskReducer(state: TaskViewModel, action: TaskAction): TaskViewModel {
  switch (action.type) {
    case "event":
      return reduceEvent(state, action.event);
    case "events":
      return reduceEvents(state, action.events);
    case "reset":
      return initialState();
    case "local.user": {
      if (action.mode === "queue") return { ...state, queued: [...state.queued, { id: action.id, text: action.text, at: action.at }] };
      let turns = state.turns;
      const last = lastTurn(state);
      if (last && last.kind === "agent") {
        const blocks = settleRequests(closeStreaming(last.blocks), action.text);
        // The reply to this message, including a run that keeps going, flows into a new turn under the bubble.
        turns = replaceTurn(turns, turns.length - 1, last.endedAt ? { ...last, blocks } : { ...last, blocks, endedAt: action.at, state: action.mode === "interrupt" && last.state === "running" ? "stopped" : "completed" });
      }
      turns = [...turns, { kind: "user", id: action.id, at: action.at, text: action.text, pending: true }];
      return { ...state, turns, status: isBusy(state.status) ? state.status : "running", brief: undefined, thinking: false };
    }
    case "local.unqueue":
      return { ...state, queued: state.queued.filter((q) => q.id !== action.id) };
    case "local.resolved": {
      let found = false;
      const turns = state.turns.map((t): Turn => {
        if (t.kind !== "agent") return t;
        let hit = false;
        const blocks = t.blocks.map((b): Block => {
          if (b.kind === "question" && b.requestId === action.requestId) {
            hit = true;
            return { ...b, answer: action.value, skipped: false };
          }
          if (b.kind === "approval" && b.requestId === action.requestId) {
            hit = true;
            return { ...b, choice: action.value, skipped: false };
          }
          return b;
        });
        if (!hit) return t;
        found = true;
        return { ...t, blocks, state: t.state === "waiting" ? "running" : t.state };
      });
      if (!found) return state;
      return { ...state, turns, status: state.status === "waiting" ? "running" : state.status };
    }
    case "local.status": {
      const last = lastTurn(state);
      const end = TURN_END[action.status];
      const at = action.at ?? new Date().toISOString();
      if (state.status === action.status && (!end || !last || last.kind !== "agent" || last.endedAt)) return state;
      if (end && last && last.kind === "agent" && !last.endedAt) {
        return { ...state, status: action.status, brief: undefined, turns: replaceTurn(state.turns, state.turns.length - 1, endTurn(last, end, at)), calls: settleCalls(state.calls, at, false), thinking: false };
      }
      if (action.status === "waiting" && last && last.kind === "agent" && !last.endedAt && last.state === "running") {
        return { ...state, status: "waiting", turns: replaceTurn(state.turns, state.turns.length - 1, { ...last, state: "waiting", blocks: closeStreaming(last.blocks) }), thinking: false };
      }
      return { ...state, status: action.status };
    }
  }
}

/* ---------------------------------------------------------------- selectors */

export function selectCalls(state: TaskViewModel): ToolCall[] {
  return state.callOrder.map((id) => state.calls[id]).filter(Boolean);
}

export function selectFiles(state: TaskViewModel): TaskFile[] {
  return state.fileOrder.map((id) => state.files[id]).filter(Boolean);
}

/** The call in progress, or the most recent one when nothing is running. */
export function selectCurrentCall(state: TaskViewModel): ToolCall | undefined {
  for (let i = state.callOrder.length - 1; i >= 0; i -= 1) {
    const c = state.calls[state.callOrder[i]];
    if (c && c.state === "running") return c;
  }
  const lastId = state.callOrder[state.callOrder.length - 1];
  return lastId ? state.calls[lastId] : undefined;
}

export function selectPlanProgress(state: TaskViewModel): { done: number; total: number; active?: PlanStep } {
  const total = state.plan.length;
  const done = state.plan.filter((s) => s.status === "done").length;
  return { done, total, active: state.plan.find((s) => s.status === "active") };
}

/** The request the task is blocked on, if any. */
export function selectPendingRequest(state: TaskViewModel): QuestionBlock | ApprovalBlock | undefined {
  const last = lastTurn(state);
  if (!last || last.kind !== "agent" || last.endedAt) return undefined;
  for (let i = last.blocks.length - 1; i >= 0; i -= 1) {
    const b = last.blocks[i];
    if (b.kind === "question" && b.answer === undefined && !b.skipped) return b;
    if (b.kind === "approval" && b.choice === undefined && !b.skipped) return b;
  }
  return undefined;
}
