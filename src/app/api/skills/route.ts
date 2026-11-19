// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { createSkill, listSkills, type SkillFileInput } from "@/lib/skills";
import { body, ok, skillError } from "@/lib/skills/http";


/** GET /api/skills: every skill the agent on the user's computer can load. */
export async function GET() {
  try {
    const session = await requireSession();
    return ok({ skills: await listSkills(session) });
  } catch (err) {
    return skillError(err, "GET /api/skills");
  }
}

/** POST /api/skills { name, description?, instructions?, files?: [{ path, content | b64 }] }: create a skill. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const input = await body<{ name?: string; description?: string; instructions?: string; files?: SkillFileInput[] }>(req);
    const skill = await createSkill(session, {
      name: String(input.name ?? ""),
      description: typeof input.description === "string" ? input.description.slice(0, 1000) : undefined,
      instructions: typeof input.instructions === "string" ? input.instructions.slice(0, 100_000) : undefined,
      files: Array.isArray(input.files) ? input.files.slice(0, 200) : undefined,
    });
    return ok({ skill }, 201);
  } catch (err) {
    return skillError(err, "POST /api/skills");
  }
}
