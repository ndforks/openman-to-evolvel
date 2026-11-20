// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Mock agent backend, used while `HERMES_BASE_URL` is unset. It plays a scripted run using the
 * same event shapes Hermes sends, so the relay, storage and UI are exercised end to end.
 *
 * Words in the prompt switch on the optional branches: "approval"/"permission" raises an
 * approval request, "ask me"/"clarify" raises a question. `OPENMAN_MOCK_SPEED=5` plays 5x faster.
 */
import type { HermesEvent, HermesRunStatus, StartRunInput } from "./hermes";
import type { Upstream } from "./upstream";

interface MockRun {
  id: string;
  input: string;
  turn: number;
  abort: AbortController;
  steers: string[];
  waiters: Map<string, (value: string) => void>;
  status: "running" | "waiting_for_approval" | "completed" | "cancelled" | "failed";
  output: string;
  /** Every event so far; `null` marks the end of the stream. Lets a reader resume from a sequence number. */
  backlog: (HermesEvent | null)[];
  wake: Set<() => void>;
}

interface MockState {
  runs: Map<string, MockRun>;
  turns: Map<string, number>;
  counter: number;
}

const g = globalThis as typeof globalThis & { __openmanMock?: MockState };
const state: MockState = (g.__openmanMock ??= { runs: new Map(), turns: new Map(), counter: 0 });

class Stopped extends Error {}

function speed(): number {
  const n = Number(process.env.OPENMAN_MOCK_SPEED);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function push(run: MockRun, event: string, fields: Record<string, unknown> = {}): void {
  const seq = run.backlog.length;
  run.backlog.push({ event, run_id: run.id, timestamp: Date.now() / 1000, ...fields, seq });
  for (const wake of [...run.wake]) wake();
}

function close(run: MockRun): void {
  run.backlog.push(null);
  for (const wake of [...run.wake]) wake();
}

function sleep(run: MockRun, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (run.abort.signal.aborted) return reject(new Stopped());
    const timer = setTimeout(() => {
      run.abort.signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms / speed());
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Stopped());
    };
    run.abort.signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Streams text as small deltas, the way a model does, then marks it as mid-turn commentary. */
async function say(run: MockRun, text: string, opts: { interim?: boolean } = {}): Promise<void> {
  const pieces = text.match(/\S+\s*|\s+/g) ?? [text];
  for (let i = 0; i < pieces.length; i += 2) {
    push(run, "message.delta", { delta: pieces.slice(i, i + 2).join("") });
    await sleep(run, 28);
  }
  if (opts.interim) push(run, "message.interim", { text, already_streamed: true });
}

/** Streams the model's thinking in small pieces. */
async function think(run: MockRun, text: string): Promise<void> {
  const pieces = text.match(/\S+\s*|\s+/g) ?? [text];
  for (let i = 0; i < pieces.length; i += 4) {
    push(run, "reasoning.delta", { text: pieces.slice(i, i + 4).join("") });
    await sleep(run, 45);
  }
  await sleep(run, 200);
}

async function tool(run: MockRun, name: string, preview: string, ms: number, result: unknown, error = false): Promise<void> {
  const id = `call_${run.id.slice(-6)}_${++state.counter}`;
  push(run, "tool.started", { tool: name, preview, tool_call_id: id });
  await sleep(run, ms);
  const text = typeof result === "string" ? result : JSON.stringify(result);
  push(run, "tool.completed", { tool: name, duration: Math.round(ms) / 1000, error, tool_call_id: id, preview: text.slice(0, 500) });
  await sleep(run, 150);
}

type TodoStatus = "pending" | "in_progress" | "completed";
async function todos(run: MockRun, titles: string[], doneCount: number): Promise<void> {
  const items = titles.map((content, i) => ({
    id: String(i + 1),
    content,
    status: (i < doneCount ? "completed" : i === doneCount ? "in_progress" : "pending") as TodoStatus,
  }));
  const preview = doneCount === 0 ? `planning ${items.length} task(s)` : `updating ${items.length} task(s)`;
  // Same result shape as Hermes' `todo_list` tool, python-style separators included.
  const result = `{"todos": [${items
    .map((t) => `{"id": ${JSON.stringify(t.id)}, "content": ${JSON.stringify(t.content)}, "status": "${t.status}"}`)
    .join(", ")}], "revision": ${doneCount + 1}}`;
  await tool(run, "todo_list", preview, 260, result);
}

/** Delivers any steer text that arrived, the way Hermes does at a tool boundary. */
async function absorbSteers(run: MockRun): Promise<void> {
  while (run.steers.length) {
    const text = run.steers.shift()!;
    await think(run, `The user added guidance mid-task: "${text}". I should fold that into the remaining steps.`);
    await say(run, `Understood, I'll take that into account: ${text.trim().replace(/[.!?]+$/, "")}.`, { interim: true });
  }
}

function waitFor(run: MockRun, requestId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      run.waiters.delete(requestId);
      reject(new Stopped());
    };
    if (run.abort.signal.aborted) return onAbort();
    run.abort.signal.addEventListener("abort", onAbort, { once: true });
    run.waiters.set(requestId, (value) => {
      run.abort.signal.removeEventListener("abort", onAbort);
      run.waiters.delete(requestId);
      resolve(value);
    });
  });
}

/** The first line of the prompt, shortened, for quoting back. */
function topicOf(input: string): string {
  const line = input.split("\n").find((l) => l.trim()) ?? input;
  const clean = line.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  return clean.length > 70 ? `${clean.slice(0, 67).replace(/\s+\S*$/, "")}...` : clean;
}

const FILLER = new Set(["a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "me", "my", "please", "write", "make", "create", "research", "find", "build", "give", "short", "best"]);

/** A few meaningful words from the prompt, for the search query and the file name. */
function keywordsOf(input: string, max: number): string[] {
  const words = topicOf(input).toLowerCase().match(/[a-z0-9$]+/g) ?? [];
  const kept = words.filter((w) => !FILLER.has(w));
  return (kept.length ? kept : words).slice(0, max);
}

function slugOf(input: string): string {
  const slug = keywordsOf(input, 4).join("-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug || "report";
}

async function firstTurn(run: MockRun): Promise<string> {
  const topic = topicOf(run.input);
  const slug = slugOf(run.input);
  const file = `/home/user/workspace/${slug}.md`;
  const query = keywordsOf(run.input, 7).join(" ") || topic;
  const wantsApproval = /\b(approval|approve|permission)\b/i.test(run.input);
  const wantsQuestion = /\b(ask me|clarify|clarifying)\b/i.test(run.input);
  const steps = [
    "Understand the request and plan the approach",
    "Research the topic across reliable sources",
    "Analyze the findings and cross-check key facts",
    "Write the report and deliver the results",
  ];

  await think(
    run,
    `The user wants: "${topic}". I should break this into steps, gather material from reliable sources, check it, and then write a clear summary. A short plan first.`,
  );
  await say(run, "I'll start by planning the work, then research the topic and put together a clear write-up for you.", { interim: true });
  await todos(run, steps, 0);

  if (wantsQuestion) {
    const requestId = `clr_${++state.counter}`;
    run.status = "waiting_for_approval";
    push(run, "clarify.request", {
      kind: "clarify",
      prompt_id: requestId,
      question: "Before I go further, how detailed should the result be?",
      choices: ["A short summary", "A detailed report", "Both, with the summary first"],
    });
    const answer = await waitFor(run, requestId);
    run.status = "running";
    push(run, "clarify.settled", { prompt_id: requestId });
    await say(run, `Got it: ${answer.trim().replace(/[.!?]+$/, "").toLowerCase()}. Continuing with the research.`, { interim: true });
  }

  await todos(run, steps, 1);
  await tool(run, "web_search", query, 1200, {
    results: [
      { title: `${query}: overview and key facts`, url: "https://en.wikipedia.org/wiki/Special:Search" },
      { title: `A practical guide: ${query}`, url: "https://example.com/guide" },
      { title: "Recent analysis and data", url: "https://example.org/analysis" },
    ],
  });
  await absorbSteers(run);
  await tool(run, "browser_navigate", "https://example.com/guide", 1400, "Page loaded: A practical guide (4,812 words)");
  await tool(run, "web_extract", "https://example.org/analysis", 1000, "Extracted 3 sections and 2 tables from the page.");
  await absorbSteers(run);

  await todos(run, steps, 2);
  await think(run, "I have enough source material. Next I'll run a quick analysis to check the numbers before writing anything down.");
  await say(run, "I found several solid sources. Now I'll analyze what they say and check the key figures.", { interim: true });
  await tool(
    run,
    "execute_code",
    "import pandas as pd; df = pd.read_json('sources.json'); print(df.describe())",
    1500,
    "count 128.0\nmean 42.7\nstd 9.3\nmin 18.0\nmax 77.0",
  );

  if (wantsApproval) {
    const requestId = `apr_${++state.counter}`;
    run.status = "waiting_for_approval";
    push(run, "approval.request", {
      request_id: requestId,
      command: "pip install --user matplotlib",
      description: "Install a Python package to draw the chart",
      choices: ["once", "session", "always", "deny"],
    });
    const choice = await waitFor(run, requestId);
    run.status = "running";
    push(run, "approval.responded", { choice, request_id: requestId, resolved: 1 });
    if (choice === "deny") {
      await tool(run, "terminal", "pip install --user matplotlib", 300, "BLOCKED: the command was denied by the user.", true);
      await say(run, "No problem, I'll skip the chart and describe the numbers in a table instead.", { interim: true });
    } else {
      await tool(run, "terminal", "pip install --user matplotlib", 1600, '{"exit_code": 0, "output": "Successfully installed matplotlib"}');
    }
  }

  await tool(run, "terminal", "python analyze.py --out summary.json", 1200, '{"exit_code": 0, "output": "wrote summary.json (12 findings)"}');
  await absorbSteers(run);

  await todos(run, steps, 3);
  const report = [
    `# ${query}`,
    "",
    "## Summary",
    "A short write-up of what the research found, with the main points first.",
    "",
    "## Key findings",
    "1. The main sources agree on the overall picture.",
    "2. The figures were checked against a second source.",
    "3. Open questions are listed at the end.",
  ].join("\n");
  await tool(run, "write_file", file, 800, { bytes_written: Buffer.byteLength(report) + 1840, path: file });
  await todos(run, steps, 4);
  await absorbSteers(run);

  const answer = [
    "I've finished the task. Here is what I did and what I found.",
    "",
    "## Key findings",
    "",
    "1. **The main sources agree on the overall picture.** Three independent references point the same way.",
    "2. **The figures hold up.** I re-ran the numbers and they match the published data within a small margin.",
    "3. **A few questions stay open.** They are listed at the end of the report so you can decide what to dig into next.",
    "",
    "| Step | Result |",
    "| --- | --- |",
    "| Research | 3 sources reviewed |",
    "| Analysis | 128 data points checked |",
    "| Report | 1 file written |",
    "",
    `The full report is saved as \`${slug}.md\`. Tell me if you'd like a different format, more depth on any point, or a slide version.`,
    "",
    "_This is a simulated run: no agent computer is connected yet._",
  ].join("\n");
  await say(run, answer);
  return answer;
}

async function followUpTurn(run: MockRun): Promise<string> {
  await think(run, `A follow-up in the same task: "${topicOf(run.input)}". I already have the context from earlier, so this should be quick.`);
  await tool(run, "read_file", "/home/user/workspace/summary.json", 600, '{"findings": 12, "sources": 3}');
  await absorbSteers(run);
  const answer = [
    "Here's the follow-up you asked for.",
    "",
    "- I reused the material from the earlier steps, so nothing had to be researched again.",
    "- The report in the workspace is still current.",
    "",
    "Anything else you'd like me to change?",
  ].join("\n");
  await say(run, answer);
  return answer;
}

async function play(run: MockRun): Promise<void> {
  try {
    await sleep(run, 500);
    const output = run.turn === 1 ? await firstTurn(run) : await followUpTurn(run);
    run.status = "completed";
    run.output = output;
    const inputTokens = 1800 + run.input.length * 2;
    const outputTokens = Math.round(output.length / 3.6) + 420;
    push(run, "run.completed", {
      completed: true,
      partial: false,
      interrupted: false,
      ...(run.steers.length ? { pending_steer: run.steers.join("\n") } : {}),
      output,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    });
  } catch (err) {
    if (err instanceof Stopped) {
      run.status = "cancelled";
      push(run, "run.cancelled", { completed: false, partial: false, interrupted: true, turn_exit_reason: "interrupted_by_user" });
    } else {
      run.status = "failed";
      push(run, "run.failed", { completed: false, error: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    close(run);
    // Keep the finished run around briefly for late status reads, like Hermes does.
    setTimeout(() => state.runs.delete(run.id), 5 * 60_000).unref?.();
  }
}

export const mockUpstream: Upstream = {
  kind: "mock",

  async start(input: StartRunInput) {
    const turn = (state.turns.get(input.sessionId) ?? 0) + 1;
    state.turns.set(input.sessionId, turn);
    const run: MockRun = {
      id: `run_mock_${Date.now().toString(36)}${(++state.counter).toString(36)}`,
      input: input.input,
      turn,
      abort: new AbortController(),
      steers: [],
      waiters: new Map(),
      status: "running",
      output: "",
      backlog: [],
      wake: new Set(),
    };
    state.runs.set(run.id, run);
    void play(run);
    return { runId: run.id };
  },

  async *events(runId, opts) {
    const run = state.runs.get(runId);
    if (!run) throw new Error(`Mock run not found: ${runId}`);
    let index = (opts.lastSeq ?? -1) + 1;
    for (;;) {
      while (index < run.backlog.length) {
        const event = run.backlog[index++];
        if (event === null) return;
        yield event;
      }
      if (opts.signal?.aborted) return;
      await new Promise<void>((resolve) => {
        const done = () => {
          run.wake.delete(done);
          opts.signal?.removeEventListener("abort", done);
          resolve();
        };
        run.wake.add(done);
        opts.signal?.addEventListener("abort", done, { once: true });
      });
    }
  },

  async status(runId): Promise<HermesRunStatus | null> {
    const run = state.runs.get(runId);
    return run ? { run_id: run.id, status: run.status, output: run.output } : null;
  },

  async stop(runId) {
    state.runs.get(runId)?.abort.abort();
  },

  async steer(runId, text) {
    const run = state.runs.get(runId);
    if (!run || run.status !== "running") return false;
    run.steers.push(text);
    push(run, "run.steered", { accepted: true });
    return true;
  },

  async approval(runId, requestId, choice) {
    const run = state.runs.get(runId);
    const key = requestId ?? [...(run?.waiters.keys() ?? [])][0];
    const waiter = key ? run?.waiters.get(key) : undefined;
    if (!waiter) throw new Error("No pending approval for this run.");
    waiter(choice);
  },

  async clarify(runId, requestId, answer) {
    const waiter = state.runs.get(runId)?.waiters.get(requestId);
    if (!waiter) throw new Error("No pending question for this run.");
    waiter(answer);
  },
};
