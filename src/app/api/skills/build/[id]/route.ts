// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { buildStatus } from "@/lib/skills/build";
import { ok, skillError } from "@/lib/skills/http";


/** GET /api/skills/build/[id]: the build, the task's status and the skill once it is saved. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    return ok(await buildStatus(session, id));
  } catch (err) {
    return skillError(err, "GET /api/skills/build/[id]");
  }
}
