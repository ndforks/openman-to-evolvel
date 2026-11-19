// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { listMail, type MailStatus } from "@/lib/db/mail";
import { route } from "@/lib/mail/http";

const STATUSES = new Set<MailStatus>(["task", "continued", "blocked", "sent", "failed", "ignored"]);

/** GET /api/mail/messages[?status=blocked]: mail the agent received and sent, newest first. */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const s = req.nextUrl.searchParams.get("status") as MailStatus | null;
    return NextResponse.json({ messages: await listMail(session.userId, { status: s && STATUSES.has(s) ? s : undefined, limit: 100 }) });
  });
}
