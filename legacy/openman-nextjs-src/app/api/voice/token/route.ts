// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { elevenLabsKey, REALTIME_MODEL, REALTIME_URL, singleUseToken } from "@/lib/voice/elevenlabs";
import { noStore } from "@/lib/voice/http";
import { consumeUsage, UsageLimitError } from "@/lib/usage";

/** Per-user burst limit for token minting (this process): 30 a minute. Daily and monthly caps are in the database. */
const recent = new Map<string, number[]>();

/**
 * POST /api/voice/token: a single-use ElevenLabs Scribe realtime token (15 min, one connection) for the browser.
 * `{ maxSessionSeconds? }` caps the session. 503 `no_key` when ElevenLabs is not configured: the browser then
 * uses its own speech recognition.
 */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    if (!elevenLabsKey()) return NextResponse.json({ error: "Live transcription by ElevenLabs is not configured.", code: "no_key" }, { status: 503 });
    const now = Date.now();
    const hits = (recent.get(session.userId) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= 30) return jsonError("Too many voice sessions. Wait a minute.", 429);
    recent.set(session.userId, [...hits, now]);
    // Every session is capped (1 h unless asked for less) and counted against the user's daily and monthly caps
    // before ElevenLabs is asked for a token: this key is the operator's, not the user's.
    let max = 3600;
    try {
      const body = (await req.json()) as { maxSessionSeconds?: unknown };
      if (typeof body.maxSessionSeconds === "number" && body.maxSessionSeconds > 0) max = Math.min(Math.ceil(body.maxSessionSeconds), 3600);
    } catch {
      max = 3600;
    }
    try {
      await consumeUsage(session.userId, "voice_sessions", 1);
      await consumeUsage(session.userId, "voice_seconds", max);
    } catch (err) {
      if (err instanceof UsageLimitError) return NextResponse.json({ error: err.message, code: err.code }, { status: 429 });
      throw err;
    }
    try {
      const token = await singleUseToken("realtime_scribe", max);
      return NextResponse.json({ token, url: REALTIME_URL, modelId: REALTIME_MODEL }, noStore);
    } catch (err) {
      console.error("[voice] token:", err instanceof Error ? err.message : err);
      return jsonError("Live transcription could not start. Try again.", 502);
    }
  });
}
