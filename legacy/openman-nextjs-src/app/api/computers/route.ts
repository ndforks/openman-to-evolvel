// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createCloudComputer, listComputers } from "@/lib/orgo/computers";
import { NOT_CONFIGURED, computerScope, json, readJson, withUser } from "@/lib/orgo/http";
import type { ComputersResponse, CreateComputerBody, CreateComputerResponse } from "@/lib/orgo/types";

const createSchema = z.object({
  os: z.string().max(40),
  plan: z.string().max(40),
  storageGb: z.number().finite(),
  location: z.string().max(40),
  name: z.string().max(80),
  temporary: z.boolean().optional(),
});

/** GET /api/computers: the signed-in user's cloud computers (their Orgo workspace), with live status. */
export function GET(req: NextRequest) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ computers: [], configured: false, reason: NOT_CONFIGURED } satisfies ComputersResponse);
    return json({ computers: await listComputers(scope), configured: true } satisfies ComputersResponse);
  });
}

/**
 * POST /api/computers: create a real computer in the user's Orgo workspace. Body: `{ os, plan, storageGb, location, name, temporary? }`.
 * Answers 201 once Orgo reports it (a Linux computer is usually running by then).
 */
export function POST(req: NextRequest) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return json({ error: `Invalid request. ${issue?.path.join(".") ?? ""}: ${issue?.message ?? ""}`.trim() }, 400);
    }
    const computer = await createCloudComputer(scope, parsed.data satisfies CreateComputerBody);
    return json({ computer } satisfies CreateComputerResponse, 201);
  });
}
