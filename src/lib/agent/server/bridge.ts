// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The app's side of the `omtools` bridge (see `agent-tools-mcp.ts`). While a run has an `omtools` call open, the
 * relay reads that task's pending calls from `~/.openman/calls/` on the owner's home computer (through the owner's
 * own Orgo key), answers each from the app's data (`runAgentTool`, scoped to that owner and task) and writes the
 * answer back. Nothing on the computer holds a credential for the app.
 */
import { computerFor, orgoClientFor } from "./connection";
import { isAgentTool, runAgentTool, type ToolContext } from "./agent-tools";

/** `mcp__omtools__task_read`, `mcp_omtools_task_read` or `omtools.task_read` -> `task_read`. */
export function omtoolsName(tool: string): string | null {
  const m = /^(?:mcp_+)?omtools(?:_+|\.|__)(.+)$/.exec(tool);
  return m && isAgentTool(m[1]) ? m[1] : null;
}

const POLL_MS = 900;
const MARK = "@@OMCALL@@";

interface PendingCall {
  file: string;
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

function parseCalls(output: string, taskId: string): PendingCall[] {
  const calls: PendingCall[] = [];
  for (const chunk of output.split(MARK).slice(1)) {
    const nl = chunk.indexOf("\n");
    const file = chunk.slice(0, nl).trim();
    try {
      const body = JSON.parse(chunk.slice(nl + 1).trim()) as { id?: string; task?: string; tool?: string; args?: Record<string, unknown> };
      if (body.task !== taskId || !body.id || !/^[a-f0-9]{32}$/.test(body.id) || !body.tool) continue;
      calls.push({ file, id: body.id, tool: body.tool, args: body.args && typeof body.args === "object" ? body.args : {} });
    } catch {
      // Half-written or foreign file: skipped.
    }
  }
  return calls;
}

/**
 * Answers this task's pending bridge calls until `keepGoing` turns false (the call closed or the run ended).
 * Returns how many calls it answered.
 */
export async function serviceBridge(ownerId: string, ctx: ToolContext, keepGoing: () => boolean, maxMs = 330_000): Promise<number> {
  const orgo = orgoClientFor(ownerId);
  const computerId = computerFor(ownerId)?.computerId;
  if (!orgo || !computerId || !/^[A-Za-z0-9]{8,64}$/.test(ctx.taskId)) return 0;
  const started = Date.now();
  const answered = new Set<string>();
  const list = `cd "$HOME/.openman/calls" 2>/dev/null || exit 0; for f in ${ctx.taskId}.*.req; do [ -f "$f" ] && { echo "${MARK}$f"; head -c 200000 "$f"; echo; }; done; true`;
  while (keepGoing() && Date.now() - started < maxMs) {
    let calls: PendingCall[] = [];
    try {
      const out = await orgo.bash(computerId, list, 20);
      calls = parseCalls(out.output ?? "", ctx.taskId).filter((c) => !answered.has(c.id));
    } catch (err) {
      console.warn(`[bridge] could not read calls for task ${ctx.taskId}:`, err instanceof Error ? err.message : err);
    }
    for (const call of calls) {
      answered.add(call.id);
      const result = await runAgentTool(ctx, call.tool, call.args);
      const payload = Buffer.from(JSON.stringify({ text: result.text, error: !!result.error }), "utf8").toString("base64");
      const base = `"$HOME/.openman/calls/${ctx.taskId}.${call.id}"`;
      try {
        await orgo.bash(computerId, `[ -f ${base}.req ] && printf %s '${payload}' | base64 -d > ${base}.tmp && mv -f ${base}.tmp ${base}.res; true`, 30);
      } catch (err) {
        console.warn(`[bridge] could not answer ${call.tool} for task ${ctx.taskId}:`, err instanceof Error ? err.message : err);
      }
    }
    if (!keepGoing()) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return answered.size;
}
