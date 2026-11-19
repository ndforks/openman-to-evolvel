// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/recording/http";
import { activeWindowTitle, requireRecording } from "@/lib/recording/server";

/** GET /api/recordings/[id]/window: title of the focused window on the computer right now, or null. */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route("GET /api/recordings/[id]/window", async (session) => {
    await requireRecording(session, (await params).id);
    return ok({ title: await activeWindowTitle(session).catch(() => null) });
  });
}
