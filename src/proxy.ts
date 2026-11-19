// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Request gate for the app (`/app/**`). Next.js 16 calls this file "proxy" (it replaced "middleware").
 *
 * - No valid session cookie: redirect to `/signin?next=<path>`, which returns there after sign-in.
 * - Session, but the email is not in `ALLOWED_EMAILS`: drop the cookie and redirect to `/waitlist`.
 * - `INVITE_GATE=1` (staging): signed in but not on the `invites` list: redirect to `/waitlist`.
 * - Development bypass `OPENMAN_DEV_BYPASS=1` (`next dev` only; a production server refuses to start with it): let everything through.
 * - `/api/**`: refuse cookie-authenticated state-changing requests from another site (CSRF, `csrf.ts`).
 *
 * The decision itself lives in `src/lib/session/gate.ts`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { DOC_PAGES } from "@/app/docs/_lib/manifest";
import { resolveShareToken } from "@/lib/db/shares";
import { SESSION_COOKIE, decodeSession } from "@/lib/session/cookie";
import { gateDecision } from "@/lib/session/gate";
import { inviteGateOn, isAdmitted } from "@/lib/session/invites";
import { isAuthDisabled } from "@/lib/supabase/config";
import { csrfRefusal } from "@/lib/session/csrf";

/** Every docs URL that is a real page. */
const DOC_PATHS = new Set(DOC_PAGES.map((page) => (page.slug ? `/docs/${page.slug}` : "/docs")));

const notFound = (request: NextRequest) => NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Cross-site request forgery: a state-changing request that carries the session cookie must come from this site.
  if (pathname.startsWith("/api/")) {
    const refused = csrfRefusal({ method: request.method, headers: request.headers, hasSessionCookie: request.cookies.has(SESSION_COOKIE), selfOrigin: request.nextUrl.origin });
    return refused ? NextResponse.json({ error: refused, code: "cross_site" }, { status: 403 }) : NextResponse.next();
  }
  // A share page streams too, so an unknown or revoked link is answered here with a real 404. A database
  // hiccup lets the request through: the page then shows its own "not found" (status 200) rather than failing.
  const share = /^\/share\/([^/]+)\/?$/.exec(pathname);
  if (share) {
    const found = await resolveShareToken(decodeURIComponent(share[1])).then(Boolean, () => true);
    return found ? NextResponse.next() : notFound(request);
  }
  // Docs pages stream from a prerendered shell, so a page cannot change its status once it has started. An unknown
  // docs URL is answered here instead: the not-found page with a real 404 status.
  if (pathname === "/docs" || pathname.startsWith("/docs/")) {
    const path = pathname.replace(/\/+$/, "") || "/docs";
    return DOC_PATHS.has(path) ? NextResponse.next() : notFound(request);
  }
  const decision = gateDecision({
    pathname,
    search: request.nextUrl.search,
    cookie: request.cookies.get(SESSION_COOKIE)?.value,
    authDisabled: isAuthDisabled,
  });
  if (decision.action === "allow") {
    // Invite gate (staging): a signed-in person who is not (or no longer) on the list goes to the waitlist.
    if (!isAuthDisabled && inviteGateOn()) {
      const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
      if (session && !(await isAdmitted(session.userId, session.email))) {
        const res = NextResponse.redirect(new URL("/waitlist", request.url));
        res.cookies.delete(SESSION_COOKIE);
        return res;
      }
    }
    return NextResponse.next();
  }
  const response = NextResponse.redirect(new URL(decision.location, request.url));
  if (decision.action === "waitlist") response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/docs/:path*", "/share/:token", "/api/:path*"],
};
