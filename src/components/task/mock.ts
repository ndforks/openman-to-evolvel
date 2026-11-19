// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Dev aid for `?mock=1`: plays a scripted task on a timer so the task view can be checked with no backend.
 * It speaks the same `AgentEvent` contract as the server, pauses on a question and an approval until the
 * view answers them, and reacts to follow-ups, queueing, interrupting and stop.
 */
import type { AgentEvent } from "@/lib/agent/types";
import type { SendMode } from "./reducer";

type EventBody = AgentEvent extends infer E ? (E extends AgentEvent ? Omit<E, "seq" | "at"> : never) : never;

type Step =
  | { do: "wait"; ms: number }
  | { do: "emit"; body: EventBody }
  /** Streams text as message deltas, then closes the message. */
  | { do: "say"; text: string }
  /** Streams reasoning deltas. */
  | { do: "think"; text: string }
  /** Holds until `respond()` is called for this request. */
  | { do: "gate"; requestId: string };

const wait = (ms: number): Step => ({ do: "wait", ms });
const emit = (body: EventBody): Step => ({ do: "emit", body });
const say = (text: string): Step => ({ do: "say", text });
const think = (text: string): Step => ({ do: "think", text });
const gate = (requestId: string): Step => ({ do: "gate", requestId });

/** A tool call that starts, runs for `ms`, then completes with `output`. */
function tool(callId: string, name: string, preview: string, ms: number, output = "", error = false): Step[] {
  return [emit({ type: "tool.started", callId, tool: name, preview }), wait(ms), emit({ type: "tool.completed", callId, tool: name, preview: output, error, durationMs: ms })];
}

type StepStatus = "pending" | "active" | "done";
const PLAN_TITLES = ["Shortlist three frameworks", "Check each project's own pages", "Draft the comparison", "Save it as Markdown"] as const;
function plan(...statuses: StepStatus[]): Step {
  return emit({ type: "plan.updated", steps: PLAN_TITLES.map((title, i) => ({ title, status: statuses[i] ?? "pending" })) });
}

export const MOCK_PROMPT = "Pick three widely used open-source agent frameworks and give me a one-page Markdown comparison.";
export const MOCK_TITLE = "Agent framework comparison";
const FILE_NAME = "agent-frameworks-comparison.md";

const SEARCH_RESULTS = `1. The best AI agent frameworks in 2026 — langchain.com
   LangGraph is the most widely adopted open-source framework for building stateful agents...

2. The best open-source frameworks for building AI agents in 2026 — github.blog
   Stars are a rough signal of attention: MetaGPT, CrewAI and LangGraph lead purpose-built frameworks...

3. A comprehensive comparison of every AI agent framework in 2026 — crewai.com
   Crews for collaboration, Flows for control. See how the major frameworks differ...`;

const REPO_PAGE = `# crewAIInc/crewAI

- Page: GitHub repository
- URL: https://github.com/crewAIInc/crewAI
- Description: Framework for orchestrating role-playing, autonomous AI agents
- License: MIT license
- Default branch: main
- Commits: 2,214

## Top-level files

- .github/
- docs/
- lib/
- .gitignore
- LICENSE
- README.md`;

const LANGGRAPH_PAGE = `# langchain-ai/langgraph

- Page: GitHub repository
- URL: https://github.com/langchain-ai/langgraph
- Description: Build resilient agents
- License: MIT license
- Default branch: main
- Created: 2023-08-09T18:33:12.000Z
- Commits: 7,315

## Top-level files

- .github/
- docs/
- examples/
- libs/
- AGENTS.md
- LICENSE
- Makefile
- README.md`;

const STAR_COMMAND = `python3 - <<'PY'
import json, urllib.request
repos=['langchain-ai/langgraph','crewAIInc/crewAI','FoundationAgents/MetaGPT']
for r in repos:
    d=json.load(urllib.request.urlopen('https://api.github.com/repos/'+r, timeout=15))
    print(f"{r}\\t{d.get('stargazers_count')} stars\\t{d.get('license',{}).get('spdx_id')}")
PY`;

const STAR_OUTPUT = `langchain-ai/langgraph    45136 stars    MIT
crewAIInc/crewAI    61088 stars    MIT
FoundationAgents/MetaGPT    71351 stars    MIT`;

const DOCUMENT = `# Three popular open-source AI agent frameworks

**Popularity snapshot (18 Nov 2026):** GitHub stars on the core repositories are a rough signal of developer attention, not active use or quality. Counts: MetaGPT **71.4k**, CrewAI **61.1k**, and LangGraph **45.1k** stars.

## MetaGPT — role-based software teams

MetaGPT organizes agents into software-company roles and follows prescribed processes to turn a natural-language requirement into artifacts such as requirements, designs, and code.

## CrewAI — collaborative crews plus controlled flows

CrewAI offers two complementary abstractions: **Crews** are role-based agents that collaborate and delegate; **Flows** provide event-driven control, state, and branching.

## LangGraph — stateful graphs with fine-grained control

LangGraph models execution as a graph of shared state, nodes, and edges, mixing deterministic code with model-driven steps.`;

function mainScript(): Step[] {
  return [
    emit({ type: "status", status: "waking", brief: "Booting the desktop" }),
    wait(900),
    emit({ type: "status", status: "running" }),
    think("Three frameworks, one page. Shortlist by adoption, confirm facts on each project's own pages, then write it up."),
    wait(500),
    say("Plan: shortlist three frameworks by how widely they are used, check the facts against each project's repository, then write a single page in Markdown."),
    wait(500),
    plan("active"),
    ...tool("c1", "web_search", "most popular open-source AI agent frameworks 2026", 1700, SEARCH_RESULTS),
    wait(300),
    ...tool("c2", "web_search", "GitHub star count LangGraph CrewAI MetaGPT repository 2026", 1900, SEARCH_RESULTS),
    wait(400),
    say("Lists online disagree because some include general LLM toolkits. I will stick to maintained frameworks built for agents, and treat stars as a hint of attention, not of quality."),
    wait(400),
    plan("done", "active"),
    ...tool("c3", "browser_exec", "https://github.com/crewAIInc/crewAI", 1800, REPO_PAGE),
    wait(250),
    ...tool("c4", "browser_exec", "https://github.com/langchain-ai/langgraph", 1600, LANGGRAPH_PAGE),
    wait(250),
    emit({ type: "tool.started", callId: "c5", tool: "terminal", preview: STAR_COMMAND }),
    wait(500),
    emit({ type: "approval.request", requestId: "approve-stars", kind: "command", title: "script reaches the network", detail: STAR_COMMAND, choices: ["Allow once", "Allow for this session", "Deny"] }),
    gate("approve-stars"),
    emit({ type: "status", status: "running" }),
    wait(1500),
    emit({ type: "tool.completed", callId: "c5", tool: "terminal", preview: STAR_OUTPUT, durationMs: 1500 }),
    wait(500),
    emit({ type: "question", requestId: "ask-audience", text: "Who will read this? It decides how technical the page gets.", options: ["Developers picking a stack", "A non-technical audience"] }),
    gate("ask-audience"),
    emit({ type: "status", status: "running" }),
    wait(700),
    say("Descriptions and licences check out on all three repositories. Writing the page now, with today's star counts dated so they are not mistaken for a ranking."),
    wait(400),
    plan("done", "done", "active"),
    ...tool("c6", "write_file", FILE_NAME, 2000, DOCUMENT),
    wait(300),
    ...tool("c7", "read_file", FILE_NAME, 1200, DOCUMENT),
    wait(300),
    plan("done", "done", "done", "active"),
    emit({ type: "file.created", fileId: "mock-file-1", name: FILE_NAME, mime: "text/markdown", size: 4812 }),
    wait(500),
    plan("done", "done", "done", "done"),
    say(
      "Here is how MetaGPT, CrewAI and LangGraph differ in approach. Star counts are a snapshot of attention, not a verdict.\n\n| Framework | Best for | Stars |\n| --- | --- | --- |\n| MetaGPT | Opinionated, role-based software pipelines | 71.4k |\n| CrewAI | Readable multi-agent crews with explicit flows | 61.1k |\n| LangGraph | Fine-grained control of stateful workflows | 45.1k |\n\nSaved as `agent-frameworks-comparison.md`.",
    ),
    wait(300),
    emit({ type: "run.completed", usage: { inputTokens: 48210, outputTokens: 2764 } }),
  ];
}

function followUpScript(text: string, n: number): Step[] {
  const short = text.length > 80 ? `${text.slice(0, 77)}...` : text;
  return [
    emit({ type: "status", status: "running" }),
    think("Same document, small change. Patch the file and say so."),
    wait(900),
    ...tool(`f${n}-1`, "patch", FILE_NAME, 1600, `${DOCUMENT}\n\n## When to choose which\n\n- Choose **MetaGPT** when your task maps naturally to a software team.\n- Choose **CrewAI** for readable crews with explicit automation flows.\n- Choose **LangGraph** when control over branching and state matters most.`),
    wait(300),
    emit({ type: "file.created", fileId: `mock-file-${n + 1}`, name: FILE_NAME, mime: "text/markdown", size: 5320 }),
    wait(300),
    say(`Updated \`${FILE_NAME}\` for "${short}". The new version is saved.`),
    wait(200),
    emit({ type: "run.completed", usage: { inputTokens: 5120, outputTokens: 310 } }),
  ];
}

export interface MockSession {
  send(text: string, mode: SendMode): void;
  stop(): void;
  respond(requestId: string): void;
  dispose(): void;
}

/** Starts the scripted task. `onEvent` receives events exactly as the SSE stream would deliver them. */
export function startMockSession(onEvent: (event: AgentEvent) => void): MockSession {
  let seq = 0;
  let disposed = false;
  let runToken = 0;
  let running = false;
  let followUps = 0;
  const gates = new Map<string, () => void>();
  const queue: string[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const push = (body: EventBody) => {
    if (disposed) return;
    seq += 1;
    onEvent({ ...body, seq, at: new Date().toISOString() } as AgentEvent);
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });

  async function stream(type: "message.delta" | "reasoning.delta", text: string, alive: () => boolean) {
    // Words arrive in small bursts, like tokens from a model.
    const pieces = text.match(/\S+\s*|\s+/g) ?? [text];
    for (let i = 0; i < pieces.length; i += 3) {
      if (!alive()) return;
      push({ type, text: pieces.slice(i, i + 3).join("") });
      await sleep(45);
    }
  }

  async function run(steps: Step[]) {
    runToken += 1;
    const token = runToken;
    const alive = () => !disposed && token === runToken;
    running = true;
    for (const step of steps) {
      if (!alive()) return;
      if (step.do === "wait") await sleep(step.ms);
      else if (step.do === "emit") push(step.body);
      else if (step.do === "think") await stream("reasoning.delta", step.text, alive);
      else if (step.do === "say") {
        await stream("message.delta", step.text, alive);
        if (alive()) push({ type: "message.completed", text: step.text });
      } else await new Promise<void>((resolve) => gates.set(step.requestId, resolve));
    }
    if (!alive()) return;
    running = false;
    const next = queue.shift();
    if (next !== undefined) startFollowUp(next);
  }

  function startFollowUp(text: string) {
    followUps += 1;
    push({ type: "user.message", text });
    void run(followUpScript(text, followUps));
  }

  function cancelRun() {
    runToken += 1;
    running = false;
    gates.clear();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  push({ type: "user.message", text: MOCK_PROMPT });
  void run(mainScript());

  return {
    send(text, mode) {
      if (disposed) return;
      if (!running) return startFollowUp(text);
      if (mode === "queue") {
        queue.push(text);
        return;
      }
      if (mode === "interrupt") {
        cancelRun();
        push({ type: "status", status: "stopped" });
        return startFollowUp(text);
      }
      // "Send without interrupting": the run carries on and takes the note into account.
      push({ type: "user.message", text });
      // A message also answers whatever the run was waiting on.
      for (const [id, resolve] of gates) {
        gates.delete(id);
        resolve();
      }
    },
    stop() {
      if (disposed || !running) return;
      cancelRun();
      queue.length = 0;
      push({ type: "status", status: "stopped" });
    },
    respond(requestId) {
      const resolve = gates.get(requestId);
      if (!resolve) return;
      gates.delete(requestId);
      resolve();
    },
    dispose() {
      disposed = true;
      cancelRun();
    },
  };
}
