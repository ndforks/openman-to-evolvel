// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withTask } from "@/lib/agent/server/http";
import { DeriveError, continueTask } from "@/lib/agent/server/derive";
import { viewOf } from "@/lib/agent/server/tasks";

/** POST /api/tasks/[id]/continue: "Continue in a new task" for a long task: inherits a summary and the files. Owner only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(
    req,
    id,
    async ({ store }) => {
      try {
        const task = await continueTask(store, id);
        return NextResponse.json({ task: viewOf(task) }, { status: 201 });
      } catch (err) {
        if (err instanceof DeriveError) return jsonError(err.message, err.status);
        throw err;
      }
    },
    { ownerOnly: true },
  );
}
