// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withStore } from "@/lib/agent/server/http";
import { deleteAllTasks } from "@/lib/personalization/account-data";

const schema = z.object({ confirm: z.literal("DELETE") });

/** DELETE /api/account/tasks `{ confirm: "DELETE" }`: stops and deletes every task (archived too), with its events, files list and share link. */
export function DELETE(req: NextRequest) {
  return withStore(req, async (store) => {
    const body = await readBody(req, schema);
    if ("error" in body) return jsonError("Type DELETE to confirm.", 400);
    return NextResponse.json({ ok: true, deleted: await deleteAllTasks(store) });
  });
}
