// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/agent/server/http";
import { dictionaryFor } from "@/lib/voice/meetings";
import { voiceConfig } from "@/lib/voice/providers";
import { noStore } from "@/lib/voice/http";

/** GET /api/voice/config: which speech engines are in use (by whether ELEVENLABS_API_KEY is set) and the user's dictionary. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ ...voiceConfig(), dictionary: await dictionaryFor(session.userId) }, noStore));
}
