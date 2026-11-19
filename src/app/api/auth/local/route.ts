import type { NextRequest } from "next/server";
import { errorResponse, json, readJson } from "@/lib/orgo/http";
import { isLoopbackRequest, localSignInState } from "@/lib/session/bypass";
import { KeyRejected, WORKSPACE_KEY_LIMITS } from "@/lib/session/identify";
import { signInWithKey } from "@/lib/session/sign-in";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session/cookie";
import { WAITLIST_PATH, safeNextPath } from "@/lib/supabase/config";

/**
 * POST /api/auth/local `{ next? }`: local sign-in for someone running OpenMan on their own machine. Signs in with this
 * server's `ORGO_API_KEY` through the same path as a pasted key (checked with Orgo, stored sealed, a real session).
 * Only when `OPENMAN_LOCAL_SIGNIN=1`, the server listens on 127.0.0.1, `APP_PUBLIC_URL` is unset or loopback, and the
 * request came from this machine (see `src/lib/session/bypass.ts`). Otherwise 404, as if the route did not exist.
 */
export async function POST(req: NextRequest) {
  try {
    if (!localSignInState(process.env).enabled || !isLoopbackRequest(req.headers)) return json({ error: "Not found." }, 404);
    const body = (await readJson(req, 4096).catch(() => ({}))) as { next?: unknown };
    const result = await signInWithKey(process.env.ORGO_API_KEY!.trim(), { via: "local" });
    if (result.kind === "waitlist") return json({ status: "waitlist", redirect: WAITLIST_PATH });
    const res = json({
      status: "approved",
      redirect: safeNextPath(typeof body?.next === "string" ? body.next : null),
      keyScope: result.identity.scope,
      ...(result.identity.scope === "workspace" ? { note: WORKSPACE_KEY_LIMITS } : {}),
    });
    res.cookies.set(SESSION_COOKIE, result.cookie, sessionCookieOptions);
    return res;
  } catch (err) {
    if (err instanceof KeyRejected) return json({ error: `ORGO_API_KEY: ${err.message}`, code: err.code }, err.status);
    return errorResponse(err, req);
  }
}
