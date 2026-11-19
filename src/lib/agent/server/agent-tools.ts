/**
 * The app's task tools, answered from the app's own data and scoped to one owner and one task:
 * - task references: `task_outline`, `task_search`, `task_read` over the tasks the user referenced in this task;
 * - speech and sound effects: `generate_speech`, `generate_sound_effect` (server key, per-user caps; `audio-tools.ts`);
 * - parallel tasks: `create_parallel_tasks` (after an "Allow these actions?" card), `parallel_tasks_status`,
 *   `read_parallel_result` over the tasks this task started.
 * Reached by the agent through the `omtools` bridge (`bridge.ts`) and by the signed-in user at `/api/agent-tools/mcp`.
 */
import type { AgentEvent, TaskStatus } from "@/lib/agent/types";
import { isValidTaskId, type Store, type TaskRecord } from "@/lib/store/types";
import { extOf } from "./task-meta";

export const AGENT_TOOL_NAMES = ["task_outline", "task_search", "task_read", "create_parallel_tasks", "parallel_tasks_status", "read_parallel_result", "create_automation", "list_automations", "update_automation", "delete_automation", "run_automation_now", "propose_project_update", "generate_speech", "generate_sound_effect"] as const;
const AUTOMATION_TOOLS = new Set<string>(["create_automation", "list_automations", "update_automation", "delete_automation", "run_automation_now"]);
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];
export const isAgentTool = (name: string): name is AgentToolName => (AGENT_TOOL_NAMES as readonly string[]).includes(name);

export interface ToolContext {
  store: Store;
  /** The task the agent works in. */
  taskId: string;
  /** Shows "Allow these actions?" in the task and resolves with the user's choice. Without it nothing is created. */
  askApproval?: (title: string, detail: string) => Promise<boolean>;
}

export interface ToolResult {
  text: string;
  error?: boolean;
}

const MAX_PARALLEL = 10;
const PART_PREVIEW = 140;
const READ_LIMIT = 30_000;

const fail = (message: string): ToolResult => ({ text: JSON.stringify({ error: message }), error: true });
const ok = (value: unknown): ToolResult => ({ text: typeof value === "string" ? value : JSON.stringify(value, null, 1) });
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

interface Part {
  n: number;
  role: "user" | "assistant" | "file";
  text: string;
}

/** A task as numbered parts: each user message, each reply, each file it saved. */
function partsOf(events: AgentEvent[]): Part[] {
  const parts: Part[] = [];
  for (const e of events) {
    if (e.type === "user.message") parts.push({ n: parts.length + 1, role: "user", text: e.text });
    else if (e.type === "message.completed" && e.text.trim()) parts.push({ n: parts.length + 1, role: "assistant", text: e.text });
    else if (e.type === "file.created") parts.push({ n: parts.length + 1, role: "file", text: e.name });
  }
  return parts;
}

const oneLine = (text: string, max = PART_PREVIEW) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

async function referenced(ctx: ToolContext, ref: unknown): Promise<TaskRecord | ToolResult> {
  const id = str(ref);
  if (!id || !isValidTaskId(id)) return fail("Pass ref: the id of a task the user referenced.");
  const self = await ctx.store.getTask(ctx.taskId);
  if (!self) return fail("This task no longer exists.");
  const refs = extOf(self).references ?? [];
  if (!refs.some((r) => r.id === id)) return fail(`Task ${id} is not one the user referenced in this task. Referenced: ${refs.map((r) => r.id).join(", ") || "none"}.`);
  const task = await ctx.store.getTask(id);
  return task ?? fail(`The referenced task ${id} no longer exists.`);
}

async function children(ctx: ToolContext): Promise<TaskRecord[]> {
  const all = await ctx.store.listTasks({ archived: "all" });
  return all.filter((t) => extOf(t).parentTaskId === ctx.taskId && extOf(t).childKind === "parallel").sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

function lastReply(events: AgentEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "message.completed" && e.text.trim()) return e.text.trim();
  }
  return "";
}

const ACTIVE: ReadonlySet<TaskStatus> = new Set(["waking", "running", "waiting"]);

export async function runAgentTool(ctx: ToolContext, tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (AUTOMATION_TOOLS.has(tool)) {
    // The owner's automations (shown on their Automations page). The bridge carries no credential; the relay is the owner's.
    if (ctx.store.kind !== "supabase") return fail("Automations need the database.");
    const { task: _task, ...rest } = args;
    void _task;
    const { runAutomationTool } = await import("@/lib/automations/mcp");
    return runAutomationTool(ctx.store.ownerId, tool, rest);
  }
  if (tool === "generate_speech" || tool === "generate_sound_effect") {
    // Operator-billed (the server's ElevenLabs key), capped per user; the MP3 lands in the task's folder.
    const { task: _t, ...rest } = args;
    void _t;
    const { runAudioTool } = await import("./audio-tools");
    return runAudioTool(ctx.store.ownerId, ctx.taskId, tool, rest);
  }
  if (tool === "propose_project_update") {
    const { proposeProjectUpdate } = await import("./project-updates");
    return proposeProjectUpdate(ctx, args).catch((err) => fail(err instanceof Error ? err.message : String(err)));
  }
  try {
    switch (tool) {
      case "task_outline": {
        const task = await referenced(ctx, args.ref);
        if ("text" in task) return task;
        const parts = partsOf(await ctx.store.listEvents(task.id));
        return ok({
          id: task.id,
          title: task.title,
          status: task.status,
          created: task.createdAt,
          parts: parts.map((p) => `${p.n}. [${p.role}] ${oneLine(p.text)}`),
          files: Object.values(extOf(task).files ?? {}).map((f) => f.name),
          hint: "Read the parts you need with task_read (from, to).",
        });
      }
      case "task_search": {
        const query = str(args.query)?.toLowerCase();
        if (!query) return fail("Pass query: the words to look for.");
        const self = await ctx.store.getTask(ctx.taskId);
        const refs = self ? (extOf(self).references ?? []) : [];
        const ids = str(args.ref) ? [str(args.ref)!] : refs.map((r) => r.id);
        const words = query.split(/\s+/).filter(Boolean);
        const hits: { task: string; part: number; role: string; snippet: string }[] = [];
        for (const id of ids) {
          const task = await referenced(ctx, id);
          if ("text" in task) continue;
          for (const p of partsOf(await ctx.store.listEvents(task.id))) {
            const lower = p.text.toLowerCase();
            if (!words.every((w) => lower.includes(w))) continue;
            const at = Math.max(0, lower.indexOf(words[0]) - 60);
            hits.push({ task: task.id, part: p.n, role: p.role, snippet: oneLine(p.text.slice(at), 220) });
            if (hits.length >= 30) break;
          }
        }
        return ok({ query, matches: hits, ...(hits.length ? {} : { note: "Nothing matched. Try fewer or other words, or read the outline." }) });
      }
      case "task_read": {
        const task = await referenced(ctx, args.ref);
        if ("text" in task) return task;
        const parts = partsOf(await ctx.store.listEvents(task.id));
        const from = Math.max(1, Math.floor(Number(args.from) || 1));
        const to = Math.min(parts.length, Math.max(from, Math.floor(Number(args.to) || from)));
        let out = "";
        for (const p of parts.slice(from - 1, to)) {
          const chunk = `--- part ${p.n} [${p.role}] ---\n${p.text}\n\n`;
          if (out.length + chunk.length > READ_LIMIT) {
            out += `[stopped at part ${p.n - 1}: read the rest in another call]`;
            break;
          }
          out += chunk;
        }
        return ok(out || `Task ${task.id} has ${parts.length} parts; part ${from} does not exist.`);
      }
      case "create_parallel_tasks": {
        const list = Array.isArray(args.tasks) ? args.tasks : [];
        const tasks = list
          .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
          .map((t) => ({ title: str(t.title)?.slice(0, 120), brief: str(t.brief)?.slice(0, 20_000) }))
          .filter((t): t is { title: string; brief: string } => !!t.title && !!t.brief);
        if (!tasks.length) return fail("Pass tasks: a list of {title, brief}.");
        if (tasks.length > MAX_PARALLEL) return fail(`At most ${MAX_PARALLEL} parallel tasks at a time.`);
        const parent = await ctx.store.getTask(ctx.taskId);
        if (!parent) return fail("This task no longer exists.");
        if (extOf(parent).parentTaskId) return fail("A parallel task cannot start parallel tasks of its own.");
        const allowed = ctx.askApproval ? await ctx.askApproval(`Start ${tasks.length} parallel task${tasks.length === 1 ? "" : "s"}?`, tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n")) : false;
        if (!allowed) return fail("The user did not allow the parallel tasks. Continue in this task, or ask what they prefer.");
        const { createTask } = await import("./tasks");
        const meta = parent.meta;
        const made = [];
        for (const t of tasks) {
          const view = await createTask(
            ctx.store,
            { prompt: t.brief, mode: meta.mode, effort: meta.effort, speed: meta.speed, projectId: parent.projectId ?? null, connectors: meta.connectors, skills: meta.skills },
            { title: t.title, meta: { parentTaskId: parent.id, childKind: "parallel" } },
          );
          made.push({ id: view.id, title: view.title });
        }
        return ok({ started: made, hint: "Check on them with parallel_tasks_status; read a finished one with read_parallel_result." });
      }
      case "parallel_tasks_status": {
        const kids = await children(ctx);
        if (!kids.length) return ok({ tasks: [], note: "This task has started no parallel tasks." });
        const rows = [];
        for (const k of kids) {
          const reply = ACTIVE.has(k.status) ? "" : lastReply(await ctx.store.listEvents(k.id));
          rows.push({ id: k.id, title: k.title, status: k.status, ...(reply ? { result: oneLine(reply, 300) } : {}) });
        }
        const pending = rows.filter((r) => ACTIVE.has(r.status as TaskStatus)).length;
        return ok({ tasks: rows, summary: pending ? `${pending} of ${rows.length} still working` : `All ${rows.length} finished` });
      }
      case "read_parallel_result": {
        const id = str(args.ref);
        const kid = (await children(ctx)).find((k) => k.id === id);
        if (!kid) return fail("Pass ref: the id of a parallel task this task started.");
        const reply = lastReply(await ctx.store.listEvents(kid.id));
        return ok({ id: kid.id, title: kid.title, status: kid.status, result: reply.slice(0, READ_LIMIT) || "(no answer yet)", files: Object.values(extOf(kid).files ?? {}).map((f) => f.path) });
      }
      default:
        return fail(`Unknown tool ${tool}.`);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** MCP tool list for the HTTP endpoint (same tools as the bridge on the computer). */
export const AGENT_TOOL_SCHEMAS = [
  { name: "task_outline", description: "Outline of a referenced task: parts with previews and its files.", inputSchema: { type: "object", properties: { task: { type: "string" }, ref: { type: "string" } }, required: ["task", "ref"] } },
  { name: "task_search", description: "Search referenced tasks for words.", inputSchema: { type: "object", properties: { task: { type: "string" }, ref: { type: "string" }, query: { type: "string" } }, required: ["task", "query"] } },
  { name: "task_read", description: "Read parts of a referenced task.", inputSchema: { type: "object", properties: { task: { type: "string" }, ref: { type: "string" }, from: { type: "integer" }, to: { type: "integer" } }, required: ["task", "ref", "from"] } },
  { name: "parallel_tasks_status", description: "Progress of the parallel tasks this task started.", inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] } },
  { name: "read_parallel_result", description: "Final answer of one parallel task.", inputSchema: { type: "object", properties: { task: { type: "string" }, ref: { type: "string" } }, required: ["task", "ref"] } },
] as const;
