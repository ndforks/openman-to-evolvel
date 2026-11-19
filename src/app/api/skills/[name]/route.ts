// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { projectsWithSkill } from "@/lib/db/skills";
import { requireSession } from "@/lib/session";
import { deleteSkill, readSkill, setSkillEnabled, updateSkill, type SkillFileInput } from "@/lib/skills";
import { body, ok, skillError } from "@/lib/skills/http";

type Ctx = { params: Promise<{ name: string }> };

/** GET /api/skills/[name]: the skill, its files (text content inline) and the projects it is attached to. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { name } = await params;
    const [detail, projects] = await Promise.all([readSkill(session, name), projectsWithSkill(session.userId, name).catch(() => [])]);
    return ok({ ...detail, projects });
  } catch (err) {
    return skillError(err, "GET /api/skills/[name]");
  }
}

/** PATCH /api/skills/[name] { enabled?: boolean, files?: [{ path, content }] }: switch on or off, or save files. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { name } = await params;
    const input = await body<{ enabled?: unknown; files?: SkillFileInput[] }>(req);
    if (typeof input.enabled === "boolean") await setSkillEnabled(session, name, input.enabled);
    const skill = Array.isArray(input.files) && input.files.length ? await updateSkill(session, name, input.files.slice(0, 200)) : null;
    return ok({ ok: true, ...(skill ? { skill } : {}) });
  } catch (err) {
    return skillError(err, "PATCH /api/skills/[name]");
  }
}

/** DELETE /api/skills/[name]: remove it from the computer (built-in skills can only be switched off). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { name } = await params;
    await deleteSkill(session, name);
    return ok({ ok: true });
  } catch (err) {
    return skillError(err, "DELETE /api/skills/[name]");
  }
}
