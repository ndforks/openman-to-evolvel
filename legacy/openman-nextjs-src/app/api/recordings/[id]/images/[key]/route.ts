// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { getRecordingImage } from "@/lib/db/recordings";
import { route } from "@/lib/recording/http";
import { RecordingError } from "@/lib/recording/server";

/** GET /api/recordings/[id]/images/[key]: one screenshot of the recording. */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  return route("GET /api/recordings/[id]/images/[key]", async (session) => {
    const { id, key } = await params;
    const img = /^[a-zA-Z0-9_-]{1,64}$/.test(key) ? await getRecordingImage(session.userId, id, key) : null;
    if (!img) throw new RecordingError("That screenshot wasn't found.", 404, "not_found");
    return new Response(new Uint8Array(Buffer.from(img.data, "base64")), { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=86400" } });
  });
}
