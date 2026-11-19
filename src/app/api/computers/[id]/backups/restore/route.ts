// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { restoreBackup } from "@/lib/agent/server/cloud";
import { BadRequest, NOT_CONFIGURED, computerScope, json, readJson, withUser } from "@/lib/orgo/http";

const schema = z.object({ backupId: z.string().min(1).max(200), mode: z.enum(["as_new", "in_place"]) });

/** POST /api/computers/[id]/backups/restore `{ backupId, mode }`: restore as a new computer, or in place (computer stopped). */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Send a backup id and a mode (as_new or in_place).");
    const { id } = await params;
    return json(await restoreBackup(scope, id, parsed.data.backupId, parsed.data.mode), 202);
  });
}
