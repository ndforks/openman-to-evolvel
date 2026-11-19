// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { notFound, withTask } from "@/lib/agent/server/http";
import { runtimeFor } from "@/lib/agent/server/tasks";

/** POST /api/tasks/[id]/stop: stop the current run and drop any queued messages. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store }) => {
    const runtime = await runtimeFor(store, id);
    if (!runtime) return notFound();
    await runtime.stop();
    return NextResponse.json({ ok: true });
  });
}
