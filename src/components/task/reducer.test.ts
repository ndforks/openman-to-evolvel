// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Unit tests for the task reducer. No test runner is installed, so these use Node's own:
 *
 *   node --test src/components/task/reducer.test.ts
 *
 * (Node 23.6+ runs TypeScript directly by stripping the types.)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentEvent } from "@/lib/agent/types";
// @ts-expect-error TS5097: Node's type stripping needs the explicit extension, the bundler resolution used by the app forbids it.
import * as reducerModule from "./reducer.ts";

const { initialState, reduceEvent, reduceEvents, taskReducer, selectCalls, selectCurrentCall, selectPendingRequest, selectPlanProgress } = reducerModule as typeof import("./reducer");
type AgentTurn = import("./reducer").AgentTurn;
type Block = import("./reducer").Block;

type Body = AgentEvent extends infer E ? (E extends AgentEvent ? Omit<E, "seq" | "at"> : never) : never;

/** Numbers the events and spaces them one second apart. */
function script(...bodies: Body[]): AgentEvent[] {
  const t0 = Date.parse("2026-11-18T20:04:00.000Z");
  return bodies.map((b, i) => ({ ...b, seq: i, at: new Date(t0 + i * 1000).toISOString() }) as AgentEvent);
}

const agentTurns = (s: ReturnType<typeof initialState>) => s.turns.filter((t): t is AgentTurn => t.kind === "agent");
const kinds = (blocks: Block[]) => blocks.map((b) => b.kind);

test("message deltas merge into one streaming text block and message.completed closes it", () => {
  const s = reduceEvents(
    initialState(),
    script({ type: "user.message", text: "hi" }, { type: "status", status: "running" }, { type: "message.delta", text: "\n\nHel" }, { type: "message.delta", text: "lo" }, { type: "message.completed", text: "Hello there" }),
  );
  assert.equal(s.turns.length, 2);
  const [turn] = agentTurns(s);
  assert.deepEqual(kinds(turn.blocks), ["text"]);
  const block = turn.blocks[0];
  assert.ok(block.kind === "text");
  assert.equal(block.text, "Hello there");
  assert.equal(block.streaming, false);
  assert.equal(s.status, "running");
});

test("tool.started and tool.completed pair by callId and group into one work-log block", () => {
  const s = reduceEvents(
    initialState(),
    script(
      { type: "user.message", text: "go" },
      { type: "tool.started", callId: "a", tool: "web_search", preview: "agent frameworks" },
      { type: "tool.started", callId: "b", tool: "terminal", preview: "ls" },
      { type: "tool.completed", callId: "a", tool: "web_search", preview: "3 results" },
      { type: "tool.completed", callId: "b", tool: "terminal", error: true, durationMs: 42 },
    ),
  );
  const [turn] = agentTurns(s);
  assert.deepEqual(kinds(turn.blocks), ["tools"]);
  const calls = selectCalls(s);
  assert.deepEqual(
    calls.map((c) => [c.callId, c.state, c.input, c.output]),
    [
      ["a", "done", "agent frameworks", "3 results"],
      ["b", "error", "ls", undefined],
    ],
  );
  assert.equal(calls[0].durationMs, 2000);
  assert.equal(calls[1].durationMs, 42);
});

test("narration between tool calls splits the work log into groups", () => {
  const s = reduceEvents(
    initialState(),
    script(
      { type: "user.message", text: "go" },
      { type: "message.delta", text: "First I search." },
      { type: "tool.started", callId: "a", tool: "web_search" },
      { type: "tool.completed", callId: "a", tool: "web_search" },
      { type: "message.delta", text: "Now I write." },
      { type: "tool.started", callId: "b", tool: "write_file", preview: "notes.md" },
    ),
  );
  const [turn] = agentTurns(s);
  assert.deepEqual(kinds(turn.blocks), ["text", "tools", "text", "tools"]);
  assert.equal(turn.blocks.every((b) => b.kind !== "text" || !b.streaming), true, "a tool start closes the streaming text");
  assert.equal(selectCurrentCall(s)?.callId, "b");
});

test("plan.updated tracks steps and marks each newly active step once", () => {
  const plan = (a: "pending" | "active" | "done", b: "pending" | "active" | "done") => ({ type: "plan.updated" as const, steps: [{ title: "Research", status: a }, { title: "Write", status: b }] });
  const s = reduceEvents(initialState(), script({ type: "user.message", text: "go" }, plan("active", "pending"), { type: "tool.started", callId: "a", tool: "web_search" }, plan("active", "pending"), plan("done", "active")));
  const [turn] = agentTurns(s);
  assert.deepEqual(kinds(turn.blocks), ["step", "tools", "step"]);
  assert.deepEqual(selectPlanProgress(s), { done: 1, total: 2, active: { title: "Write", status: "active" } });
});

test("a question pauses the turn; answering through the card resumes it", () => {
  let s = reduceEvents(initialState(), script({ type: "user.message", text: "go" }, { type: "question", requestId: "r1", text: "Which one?", options: ["A", "B"] }));
  assert.equal(s.status, "waiting");
  assert.equal(agentTurns(s)[0].state, "waiting");
  assert.equal(selectPendingRequest(s)?.requestId, "r1");

  s = taskReducer(s, { type: "local.resolved", requestId: "r1", value: "B" });
  assert.equal(s.status, "running");
  assert.equal(selectPendingRequest(s), undefined);
  const q = agentTurns(s)[0].blocks[0];
  assert.ok(q.kind === "question");
  assert.equal(q.answer, "B");
});

test("an approval is settled when the tool it guarded finishes", () => {
  const s = reduceEvents(
    initialState(),
    script(
      { type: "user.message", text: "clean up" },
      { type: "tool.started", callId: "a", tool: "terminal", preview: "rm -rf /tmp/x" },
      { type: "approval.request", requestId: "p1", kind: "approval", title: "Run this command?", detail: "rm -rf /tmp/x", choices: ["once", "deny"] },
      { type: "tool.completed", callId: "a", tool: "terminal" },
    ),
  );
  assert.equal(s.status, "running");
  const approval = agentTurns(s)[0].blocks.find((b) => b.kind === "approval");
  assert.ok(approval && approval.kind === "approval");
  assert.equal(approval.skipped, true);
});

test("a user message answers an open question and starts a new turn", () => {
  const s = reduceEvents(initialState(), script({ type: "user.message", text: "go" }, { type: "question", requestId: "r1", text: "Which one?" }, { type: "user.message", text: "The second" }, { type: "message.delta", text: "Ok" }));
  assert.deepEqual(
    s.turns.map((t) => t.kind),
    ["user", "agent", "user", "agent"],
  );
  const q = agentTurns(s)[0].blocks[0];
  assert.ok(q.kind === "question");
  assert.equal(q.answer, "The second");
  assert.equal(agentTurns(s)[0].state, "completed");
});

test("run.completed ends the turn, moves files under the result and settles running calls", () => {
  const s = reduceEvents(
    initialState(),
    script(
      { type: "user.message", text: "go" },
      { type: "tool.started", callId: "a", tool: "write_file", preview: "report.md" },
      { type: "file.created", fileId: "f1", name: "report.md", mime: "text/markdown", size: 1200 },
      { type: "message.delta", text: "Done." },
      { type: "run.completed", usage: { inputTokens: 10, outputTokens: 20 } },
    ),
  );
  assert.equal(s.status, "completed");
  const [turn] = agentTurns(s);
  assert.equal(turn.state, "completed");
  assert.ok(turn.endedAt);
  assert.deepEqual(kinds(turn.blocks), ["tools", "text", "files"]);
  assert.deepEqual(turn.usage, { inputTokens: 10, outputTokens: 20 });
  assert.equal(selectCalls(s)[0].state, "done");
});

test("run.failed records the error and marks the task failed", () => {
  const s = reduceEvents(initialState(), script({ type: "user.message", text: "go" }, { type: "message.delta", text: "Trying" }, { type: "run.failed", error: "HTTP 400: nope" }));
  assert.equal(s.status, "error");
  assert.equal(s.error, "HTTP 400: nope");
  const [turn] = agentTurns(s);
  assert.equal(turn.state, "error");
  assert.deepEqual(kinds(turn.blocks), ["text", "error"]);
});

test("a stop wins over the completion event that trails it, and late events do not reopen the turn", () => {
  const s = reduceEvents(
    initialState(),
    script({ type: "user.message", text: "go" }, { type: "tool.started", callId: "a", tool: "terminal" }, { type: "status", status: "stopped" }, { type: "message.delta", text: " tail" }, { type: "run.completed" }),
  );
  assert.equal(s.status, "stopped");
  const turns = agentTurns(s);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].state, "stopped");
});

test("events are idempotent by seq, so a replay after reconnect changes nothing", () => {
  const events = script({ type: "user.message", text: "go" }, { type: "message.delta", text: "Hello" }, { type: "tool.started", callId: "a", tool: "terminal" });
  const once = reduceEvents(initialState(), events);
  const twice = reduceEvents(once, events);
  assert.equal(twice, once);
  assert.equal(reduceEvent(once, events[1]), once);
});

test("optimistic follow-ups: a sent message shows at once and its echo does not duplicate it", () => {
  let s = reduceEvents(initialState(), script({ type: "user.message", text: "go" }, { type: "message.delta", text: "Working" }));
  s = taskReducer(s, { type: "local.user", id: "local-1", text: "Also add a summary", mode: "steer", at: "2026-11-18T20:05:00.000Z" });
  assert.equal(s.turns.length, 3);
  assert.equal(s.turns[2].kind === "user" && s.turns[2].pending, true);

  s = reduceEvent(s, { seq: 10, at: "2026-11-18T20:05:01.000Z", type: "user.message", text: "Also add a summary" });
  assert.equal(s.turns.length, 3);
  assert.equal(s.turns[2].kind === "user" && s.turns[2].pending, false);
});

test("queued follow-ups wait in the queue until the server picks them up", () => {
  let s = reduceEvents(initialState(), script({ type: "user.message", text: "go" }, { type: "message.delta", text: "Working" }));
  s = taskReducer(s, { type: "local.user", id: "local-1", text: "Then translate it", mode: "queue", at: "2026-11-18T20:05:00.000Z" });
  assert.equal(s.turns.length, 2);
  assert.equal(s.queued.length, 1);

  s = reduceEvent(s, { seq: 10, at: "2026-11-18T20:06:00.000Z", type: "user.message", text: "Then translate it" });
  assert.equal(s.queued.length, 0);
  assert.equal(s.turns.length, 3);
  assert.equal(s.turns[2].kind, "user");
});
