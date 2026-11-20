// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Route plumbing for /api/automations: session first, readable errors. */
import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/agent/server/http";
import { appOrigin } from "@/lib/orgo/http";
import type { Session } from "@/lib/session";
import { rememberPlan } from "./mcp";
import { AutomationError, publicBase } from "./service";

/** The app's public base for hook URLs: `APP_PUBLIC_URL`, never a request header (see `appOrigin`). */
export function baseOf(req: NextRequest): string {
  return publicBase(appOrigin(req));
}

/** `withSession` (which calls `requireSession()`) plus `AutomationError` to status codes. */
export function route(req: NextRequest, fn: (session: Session) => Promise<NextResponse>): Promise<NextResponse> {
  return withSession(req, async (session) => {
    rememberPlan(session);
    try {
      return await fn(session);
    } catch (err) {
      if (err instanceof AutomationError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
  });
}
