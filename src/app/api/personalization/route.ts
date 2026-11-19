// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, withSession } from "@/lib/agent/server/http";
import { mirrorStatus, scheduleMirror } from "@/lib/personalization/hermes-user";
import { getPersonalization, PERSONALIZATION_FIELDS, PERSONALIZATION_LIMITS, savePersonalization } from "@/lib/personalization/profile";

/** GET /api/personalization: `{ personalization, mirror }` (mirror: last USER.md sync on the agent computer, or null). */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ personalization: await getPersonalization(session.userId), mirror: mirrorStatus(session.userId) }));
}

const schema = z
  .object({
    nickname: z.string().max(PERSONALIZATION_LIMITS.nickname).optional(),
    occupation: z.string().max(PERSONALIZATION_LIMITS.occupation).optional(),
    about: z.string().max(PERSONALIZATION_LIMITS.about).optional(),
    instructions: z.string().max(PERSONALIZATION_LIMITS.instructions).optional(),
    useKnowledge: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");

/**
 * PATCH /api/personalization: change some fields (or the "Use knowledge" switch). Profile changes are
 * also mirrored into Hermes' USER.md on the user's computer a few seconds later.
 */
export function PATCH(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const saved = await savePersonalization(session.userId, body.data);
    const profileChanged = PERSONALIZATION_FIELDS.some((f) => body.data[f] !== undefined);
    const mirror = profileChanged ? scheduleMirror(session, saved) : mirrorStatus(session.userId);
    return NextResponse.json({ personalization: saved, mirror });
  });
}
