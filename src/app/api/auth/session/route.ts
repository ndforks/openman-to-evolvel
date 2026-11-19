// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { headers } from "next/headers";
import { json } from "@/lib/orgo/http";
import { getSession } from "@/lib/session";
import { isLoopbackRequest, localSignInState } from "@/lib/session/bypass";
import { isAuthDisabled } from "@/lib/supabase/config";

/**
 * GET /api/auth/session: who is signed in (cookie only, no Orgo call).
 * `{ session: Session | null, authDisabled, localSignIn }`: `authDisabled` is the development bypass
 * (`OPENMAN_DEV_BYPASS=1`, `next dev` only); `localSignIn` is true when this request may use local sign-in.
 */
export async function GET() {
  const h = await headers();
  return json({ session: await getSession(), authDisabled: isAuthDisabled, localSignIn: localSignInState(process.env).enabled && isLoopbackRequest(h) });
}
