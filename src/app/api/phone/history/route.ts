// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { listCalls, listSms } from "@/lib/db/phone";
import { route } from "@/lib/mail/http";

/** GET /api/phone/history: SMS records and call history, newest first. */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const [messages, calls] = await Promise.all([listSms(session.userId, { limit: 100 }), listCalls(session.userId, 100)]);
    return NextResponse.json({ messages, calls });
  });
}
