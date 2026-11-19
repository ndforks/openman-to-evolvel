// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { dbConfigured } from "@/lib/db/client";
import { exportUserData } from "@/lib/personalization/account-data";

/** GET /api/account/export: a zip of the caller's tasks, events, projects, knowledge, settings and the rest. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => {
    if (!dbConfigured()) return jsonError("The database is not connected.", 503);
    const zip = await exportUserData(session.userId);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="data-export-${stamp}.zip"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
      },
    });
  });
}
