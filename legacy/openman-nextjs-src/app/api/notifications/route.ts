// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/agent/server/http";
import { listNotifications } from "@/lib/db/notifications";

/** GET /api/notifications[?unread=1][&limit=50]: `{ notifications, unread }`, newest first. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => {
    const q = req.nextUrl.searchParams;
    const limit = Number(q.get("limit")) || 50;
    return NextResponse.json(await listNotifications(session.userId, { unreadOnly: q.get("unread") === "1", limit }));
  });
}
