// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { withStore } from "@/lib/agent/server/http";
import { AGENT_TOOL_SCHEMAS, runAgentTool } from "@/lib/agent/server/agent-tools";
import { isValidTaskId } from "@/lib/store";

const PROTOCOL = "2025-06-18";
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } };

/**
 * POST /api/agent-tools/mcp: the app's task tools (task references and parallel-task status) as an MCP server
 * (Streamable HTTP, stateless JSON) for the signed-in user (`requireSession()`). Every call names `task`, which must be
 * one of the caller's own tasks; references and children are read through that user's store only. The agent on the
 * computer reaches the same tools through the `omtools` bridge, which needs no credential on the computer.
 * Starting parallel tasks is left out here: it needs the in-task "Allow these actions?" card.
 */
export function POST(req: NextRequest) {
  return withStore(req, async (store) => {
    let msg: Rpc;
    try {
      msg = (await req.json()) as Rpc;
    } catch {
      return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, { status: 400 });
    }
    const id = msg.id ?? null;
    const reply = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result });
    const error = (code: number, message: string) => NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
    if (msg.id === undefined) return new NextResponse(null, { status: 202 });
    switch (msg.method) {
      case "initialize":
        return reply({ protocolVersion: msg.params?.protocolVersion ?? PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "omtools", version: "2" } });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: AGENT_TOOL_SCHEMAS });
      case "tools/call": {
        const name = msg.params?.name ?? "";
        const args = msg.params?.arguments ?? {};
        if (!AGENT_TOOL_SCHEMAS.some((t) => t.name === name)) return error(-32602, "Unknown tool");
        const taskId = typeof args.task === "string" ? args.task : "";
        if (!isValidTaskId(taskId) || !(await store.getTask(taskId))) return reply({ content: [{ type: "text", text: JSON.stringify({ error: "Pass task: the id of one of your tasks." }) }], isError: true });
        const result = await runAgentTool({ store, taskId }, name, args);
        return reply({ content: [{ type: "text", text: result.text }], ...(result.error ? { isError: true } : {}) });
      }
      default:
        return error(-32601, "Method not found");
    }
  });
}
