// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { getWebsiteRow } from "@/lib/db/websites";
import { checkpointScreenshot } from "@/lib/websites/server";

/**
 * GET: the screenshot captured for that version (PNG). 204 when there is none (never captured, or the site's folder
 * changed on the computer): the page shows its placeholder, without a failed request in the console.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string; sha: string }> }) {
  return withSession(req, async (session) => {
    const { id, sha } = await params;
    const row = await getWebsiteRow(session.userId, id);
    if (!row) return jsonError("Website not found.", 404);
    const png = await checkpointScreenshot(session, row, sha).catch(() => null);
    if (!png) return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } }) as never;
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400, immutable" } }) as never;
  });
}
