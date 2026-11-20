// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { seal } from "@/lib/crypto";
import { insertCustomConnector, listCustomConnectors, updateCustomConnector } from "@/lib/db/connectors";
import { hermesEntryFor, homeComputerId, serverNameFor, syncApisOnComputer, testHermesMcp, testMcpUrl, toolsFromHermesTest, writeHermesMcp } from "@/lib/connectors/server";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/net/safe-fetch";

const headerName = z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "Header names use letters, digits and dashes.");

const mcpSchema = z.object({
  kind: z.literal("mcp"),
  name: z.string().trim().min(1).max(60),
  transport: z.enum(["http", "command"]).default("http"),
  url: z.string().trim().max(2000).optional(),
  command: z.string().trim().max(200).optional(),
  args: z.array(z.string().max(500)).max(30).optional(),
  /** HTTP: request headers. Command: environment variables. Stored sealed. */
  headers: z.record(z.string().max(200), z.string().max(4000)).optional(),
});

const apiSchema = z.object({
  kind: z.literal("api"),
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().url().max(2000),
  key: z.string().max(4000).optional(),
  authHeader: headerName.optional(),
});

const bodySchema = z.discriminatedUnion("kind", [mcpSchema, apiSchema]);

/** GET /api/connectors/custom: the user's custom MCP servers and APIs (never their secrets). */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session }) => {
    const rows = await listCustomConnectors(session.userId);
    return json({ custom: rows.map(({ secretEnc: _s, ...rest }) => ({ ...rest, hasSecret: !!_s })) });
  });
}

/**
 * POST /api/connectors/custom: adds a custom MCP server or API and installs it for Hermes on the user's computer.
 * - MCP over HTTP: tested here first (initialize + tools/list); refused if it does not answer.
 * - MCP command: written to Hermes' config, then tested on the computer with `hermes mcp test`.
 * - API: key sealed here; exposed to the agent as the generic `http_request` tool.
 */
export function POST(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BadRequest(`${issue?.path.join(".") || "Request"}: ${issue?.message ?? "invalid"}`);
    }
    const body = parsed.data;
    const computerId = await homeComputerId(session);
    if (!computerId) return json({ error: "Your agent's computer isn't set up yet. Start a task first." }, 409);
    const existing = await listCustomConnectors(session.userId);
    const taken = new Set(existing.map((c) => c.serverName));
    const unique = (base: string) => {
      let name = base;
      for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
      return name;
    };

    if (body.kind === "api") {
      // The agent calls it from the user's own computer, but a URL that only resolves to an internal address is
      // refused here too, so the stored connector never points at a private network.
      try {
        await assertPublicUrl(body.url);
      } catch (err) {
        throw new BadRequest(err instanceof UnsafeUrlError ? err.message : "That isn't a valid URL.");
      }
      const serverName = unique(serverNameFor("api_", body.name));
      const record = await insertCustomConnector(session.userId, {
        kind: "api",
        name: body.name,
        url: body.url,
        secretEnc: body.key ? seal(body.key) : null,
        authHeader: body.authHeader ?? "Authorization",
        serverName,
        tools: [{ name: "http_request", description: `Call ${body.name} (${body.url})` }],
        status: "installing",
      });
      try {
        await syncApisOnComputer(orgo, computerId, [...existing, record]);
        await updateCustomConnector(session.userId, record.id, { status: "ready", statusDetail: null });
        return json({ connector: { ...record, secretEnc: undefined, status: "ready" } }, 201);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't install it.";
        await updateCustomConnector(session.userId, record.id, { status: "error", statusDetail: msg });
        return json({ error: msg, id: record.id }, 502);
      }
    }

    // MCP
    const headers = body.headers ?? {};
    for (const k of Object.keys(headers)) if (!/^[A-Za-z0-9_-]{1,64}$/.test(k)) throw new BadRequest(`"${k}" isn't a valid header or variable name.`);
    const serverName = unique(serverNameFor("", body.name));
    if (body.transport === "http") {
      if (!body.url) throw new BadRequest("Enter the server URL.");
      let tools;
      try {
        tools = await testMcpUrl(body.url, headers);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "The connection test failed." }, 422);
      }
      const record = await insertCustomConnector(session.userId, {
        kind: "mcp",
        name: body.name,
        transport: "http",
        url: body.url,
        secretEnc: Object.keys(headers).length ? seal(JSON.stringify(headers)) : null,
        serverName,
        tools,
        status: "installing",
      });
      try {
        await writeHermesMcp(orgo, computerId, { [serverName]: hermesEntryFor(record) });
        await updateCustomConnector(session.userId, record.id, { status: "ready" });
        return json({ connector: { ...record, secretEnc: undefined, status: "ready" } }, 201);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't install it.";
        await updateCustomConnector(session.userId, record.id, { status: "error", statusDetail: msg });
        return json({ error: msg, id: record.id }, 502);
      }
    }

    if (!body.command || !/^[A-Za-z0-9_./@-]+$/.test(body.command)) throw new BadRequest("Enter the command to run, like npx or uvx.");
    const record = await insertCustomConnector(session.userId, {
      kind: "mcp",
      name: body.name,
      transport: "command",
      command: body.command,
      args: body.args ?? [],
      secretEnc: Object.keys(headers).length ? seal(JSON.stringify(headers)) : null,
      serverName,
      status: "installing",
    });
    try {
      await writeHermesMcp(orgo, computerId, { [serverName]: hermesEntryFor(record) }, false);
      const test = await testHermesMcp(orgo, computerId, serverName);
      const tools = toolsFromHermesTest(test.output);
      if (!test.ok) {
        await writeHermesMcp(orgo, computerId, { [serverName]: null }, false);
        await updateCustomConnector(session.userId, record.id, { status: "error", statusDetail: test.output.slice(-500) });
        return json({ error: "The server didn't start on your computer.", detail: test.output.slice(-800), id: record.id }, 422);
      }
      await writeHermesMcp(orgo, computerId, {}, true);
      await updateCustomConnector(session.userId, record.id, { status: "ready", tools });
      return json({ connector: { ...record, secretEnc: undefined, status: "ready", tools }, detail: test.output.slice(-800) }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't install it.";
      await updateCustomConnector(session.userId, record.id, { status: "error", statusDetail: msg });
      return json({ error: msg, id: record.id }, 502);
    }
  });
}
