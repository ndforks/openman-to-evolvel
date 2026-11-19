import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/agent/server/http";
import { setRevocation } from "@/lib/db/revocations";
import { sessionsRevokedAt } from "@/lib/personalization/sessions";
import { forgetRevocation } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session/cookie";

/**
 * GET /api/account/sessions: the session making this request (sign-in method, account, browser) and when
 * "sign out everywhere" was last used.
 */
export function GET(req: NextRequest) {
  return withSession(req, async (session) =>
    NextResponse.json({
      method: session.dev ? "dev" : "orgo",
      email: session.email,
      workspaceId: session.workspaceId,
      userAgent: req.headers.get("user-agent") ?? "",
      revokedAt: await sessionsRevokedAt(session.userId),
    }),
  );
}

/**
 * POST /api/account/sessions: sign out everywhere. Records the time (every session cookie and automations token
 * issued before it is refused, at once on this server) and ends this browser's session now.
 */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const now = new Date();
    const at = now.toISOString();
    // Stored in `revocations`, which the settings routes cannot write. The automations tool token on the
    // user's computer is revoked too; the next setup on that computer mints a new one.
    await setRevocation(session.userId, { sessions: now, automations: now });
    forgetRevocation(session.userId); // applies on this server at once, not after the cache expires
    const res = NextResponse.json({ ok: true, revokedAt: at });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  });
}
