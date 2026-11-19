// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { testMcpUrl } from "@/lib/connectors/server";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";

const schema = z.object({ url: z.string().trim().min(1).max(2000), headers: z.record(z.string().max(64), z.string().max(4000)).optional() });

/** POST /api/connectors/custom/test: connects to an MCP server URL and lists its tools, without saving anything. */
export function POST(req: NextRequest) {
  return withUser(req, async () => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Enter the server URL.");
    try {
      const tools = await testMcpUrl(parsed.data.url, parsed.data.headers ?? {});
      return json({ ok: true, tools });
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : "The connection test failed." }, 422);
    }
  });
}
