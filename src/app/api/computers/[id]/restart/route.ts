// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { restartCloudComputer } from "@/lib/orgo/computers";
import { NOT_CONFIGURED, computerScope, json, withUser } from "@/lib/orgo/http";

/** POST /api/computers/[id]/restart: reboot one of the user's computers in place. Answers when it is back. Their home computer is refused. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    return json({ ok: true, computer: await restartCloudComputer(scope, id) });
  });
}
