// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import type { ComputerView } from "@/lib/agent/types";
import { viewCloudComputer } from "@/lib/orgo/computers";
import { NOT_CONFIGURED, computerScope, json, withUser } from "@/lib/orgo/http";

/**
 * GET /api/computers/[id]/view: where to watch one of the user's computers, in the task API's `ComputerView` shape.
 * `vncUrl` is null while the computer is not running. The URL carries the computer's password: do not log or store it.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json((await viewCloudComputer(scope, id)) satisfies ComputerView);
  });
}
