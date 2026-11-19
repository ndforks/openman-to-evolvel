// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { listSkillBuilds } from "@/lib/db/skills";
import { requireSession } from "@/lib/session";
import { startBuild } from "@/lib/skills/build";
import { body, ok, skillError } from "@/lib/skills/http";


/** GET /api/skills/build: recent "Build from a task" requests. */
export async function GET() {
  try {
    const session = await requireSession();
    return ok({ builds: await listSkillBuilds(session.userId) });
  } catch (err) {
    return skillError(err, "GET /api/skills/build");
  }
}

/** POST /api/skills/build { taskId, name? }: ask the agent, in that task's session, to package the task as a skill. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { taskId, name } = await body<{ taskId?: string; name?: string }>(req);
    const build = await startBuild(session, String(taskId ?? ""), typeof name === "string" ? name : undefined);
    return ok({ build }, 202);
  } catch (err) {
    return skillError(err, "POST /api/skills/build");
  }
}
