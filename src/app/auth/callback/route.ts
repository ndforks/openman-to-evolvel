// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Old Supabase Auth return address. Sign-in is now "Sign in with Orgo" (device code, no redirect back),
 * so anything that still lands here is sent to the sign-in page.
 */
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/supabase/config";

export function GET(request: NextRequest) {
  const url = new URL("/signin", request.url);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (next !== "/app") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
