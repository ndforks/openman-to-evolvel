// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { installOfficial } from "@/lib/skills";
import { body, ok, skillError } from "@/lib/skills/http";
import { OFFICIAL_CATEGORIES, OFFICIAL_SKILLS } from "@/lib/skills/official";

export const maxDuration = 300;

/** GET /api/skills/official: the curated library (name, description, source, licence). */
export async function GET() {
  try {
    await requireSession();
    return ok({ categories: OFFICIAL_CATEGORIES, skills: OFFICIAL_SKILLS });
  } catch (err) {
    return skillError(err, "GET /api/skills/official");
  }
}

/** POST /api/skills/official { name }: install one through `hermes skills install`. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { name } = await body<{ name?: string }>(req);
    const { skill } = await installOfficial(session, String(name ?? ""));
    return ok({ skill }, 201);
  } catch (err) {
    return skillError(err, "POST /api/skills/official");
  }
}
