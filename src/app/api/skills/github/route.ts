// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { installFromGithub } from "@/lib/skills";
import { body, ok, skillError } from "@/lib/skills/http";

export const maxDuration = 300;

/** POST /api/skills/github { url }: install a public repo's skill (SKILL.md at the root or at the linked path) with Hermes' installer. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { url } = await body<{ url?: string }>(req);
    return ok({ skill: await installFromGithub(session, String(url ?? "")) }, 201);
  } catch (err) {
    return skillError(err, "POST /api/skills/github");
  }
}
