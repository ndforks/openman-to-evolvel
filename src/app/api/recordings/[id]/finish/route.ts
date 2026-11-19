// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { json, ok, route } from "@/lib/recording/http";
import { finishRecording } from "@/lib/recording/server";

/** POST /api/recordings/[id]/finish { screenW?, screenH? }: stop capture; the uploaded timeline becomes the steps to review. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route("POST /api/recordings/[id]/finish", async (session) => {
    const body = await json<{ screenW?: unknown; screenH?: unknown }>(req).catch(() => ({}) as { screenW?: unknown; screenH?: unknown });
    const dim = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 320 && v <= 7680 ? v : undefined);
    return ok({ recording: await finishRecording(session, (await params).id, { screenW: dim(body.screenW), screenH: dim(body.screenH) }) });
  });
}
