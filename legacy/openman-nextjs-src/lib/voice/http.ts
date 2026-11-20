// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Error shaping shared by the `/api/voice` routes. Server only. */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/agent/server/http";
import { GuestError } from "./guest";
import { VoiceError } from "./meetings";

/** Runs a route body; a `VoiceError`/`GuestError` becomes its own status, a thrown `Response` (401 from `orgoFor`) is passed on. */
export async function voiceRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof VoiceError || err instanceof GuestError) return jsonError(err.message, err.status);
    if (err instanceof Response) {
      const body = await err.text().catch(() => "");
      return new NextResponse(body, { status: err.status, headers: { "Content-Type": "application/json" } });
    }
    throw err;
  }
}

export const noStore = { headers: { "Cache-Control": "no-store" } };
