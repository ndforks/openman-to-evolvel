// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { getProjectSkills, setProjectSkills } from "@/lib/db/skills";
import { requireSession } from "@/lib/session";
import { SKILL_NAME, SkillError } from "@/lib/skills";
import { body, ok, skillError } from "@/lib/skills/http";

type Ctx = { params: Promise<{ projectId: string }> };

/** GET /api/skills/projects/[projectId]: names of the skills attached to a project. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { projectId } = await params;
    return ok({ skills: await getProjectSkills(session.userId, projectId) });
  } catch (err) {
    return skillError(err, "GET /api/skills/projects/[projectId]");
  }
}

/** PUT /api/skills/projects/[projectId] { skills: string[] }: replace the attached skills. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { projectId } = await params;
    const { skills } = await body<{ skills?: unknown }>(req);
    if (!Array.isArray(skills) || skills.some((s) => typeof s !== "string" || !SKILL_NAME.test(s))) throw new SkillError("Send skills as a list of skill names.", "bad_name");
    if (projectId.length > 200) throw new SkillError("Unknown project.", "not_found", 404);
    return ok({ skills: await setProjectSkills(session.userId, projectId, skills as string[]) });
  } catch (err) {
    return skillError(err, "PUT /api/skills/projects/[projectId]");
  }
}
