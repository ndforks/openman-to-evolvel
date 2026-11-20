// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/mail/http";
import { listPendingApprovals } from "@/lib/phone/service";

/** GET /api/phone/approvals[?taskId=]: outbound texts waiting for the user's permission. */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const taskId = req.nextUrl.searchParams.get("taskId") ?? undefined;
    return NextResponse.json({ approvals: await listPendingApprovals(session.userId, taskId) });
  });
}
