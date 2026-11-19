import type { NextRequest } from "next/server";
import { brand } from "@/config/brand";
import { appOrigin, errorResponse, json } from "@/lib/orgo/http";
import { OrgoError, startDeviceSignIn } from "@/lib/orgo/user-client";
import { logEvent } from "@/lib/observability/log";
import { SIGNIN_COOKIE, openPendingSignIn, sealDeviceHandle, sealPendingSignIn, sessionCookieOptions } from "@/lib/session/cookie";
import { REUSE_WINDOW_S, SignInBusy, takeSignInStart } from "@/lib/session/signin-limit";

/**
 * POST /api/auth/orgo/start: starts "Sign in with Orgo" (Orgo's device-code flow).
 * Answers `{ userCode, verificationUrl, interval, expiresIn, handle }`: the browser opens `verificationUrl`
 * in a new tab, shows `userCode`, and polls `/api/auth/orgo/poll` every `interval` seconds.
 *
 * - The pending sign-in is also kept in the HttpOnly `om_signin` cookie: only this browser can poll it, and a
 *   repeated click within a few minutes gets the same code back without asking Orgo again.
 * - New starts are rate limited per client address and globally (see `signin-limit.ts`); when the budget is
 *   spent the answer is 429 with a message saying when to try again.
 * - The label Orgo shows on its approve page uses `APP_PUBLIC_URL`, never a request header.
 * - 429 `{ code: "signin_busy", retryAfter }` from our budget or from Orgo's own cap; the screen offers the API key path.
 */
export async function POST(req: NextRequest) {
  try {
    const now = Date.now();
    const reuse = openPendingSignIn(req.cookies.get(SIGNIN_COOKIE)?.value, now);
    if (reuse && now - reuse.startedAt < REUSE_WINDOW_S * 1000 && reuse.expiresAt * 1000 - now > 60_000) {
      return json({ userCode: reuse.userCode, verificationUrl: reuse.verificationUrl, interval: reuse.interval, expiresIn: Math.floor(reuse.expiresAt - now / 1000), handle: reuse.handle, reused: true });
    }
    await takeSignInStart(req.headers);
    const started = await startDeviceSignIn(`${brand.name} web`, new URL(appOrigin(req)).host);
    const expiresIn = started.expires_in || 1800;
    const pending = {
      handle: sealDeviceHandle(started.device_code, expiresIn),
      userCode: started.user_code,
      verificationUrl: started.verification_uri_complete,
      interval: started.interval || 2,
      expiresAt: Math.floor(now / 1000) + expiresIn,
      startedAt: now,
    };
    const res = json({ userCode: pending.userCode, verificationUrl: pending.verificationUrl, interval: pending.interval, expiresIn, handle: pending.handle });
    res.cookies.set(SIGNIN_COOKIE, sealPendingSignIn(pending), { ...sessionCookieOptions, sameSite: "strict", maxAge: expiresIn });
    return res;
  } catch (err) {
    if (err instanceof SignInBusy) {
      void logEvent("warn", "signin.busy", { data: { retryAfter: err.retryAfter } });
      const res = json({ error: err.message, code: "signin_busy", retryAfter: err.retryAfter }, 429);
      res.headers.set("Retry-After", String(err.retryAfter));
      return res;
    }
    if (err instanceof OrgoError && err.status === 429) {
      // Orgo's own cap (20 starts an hour per server address) was reached before ours.
      const wait = err.retryAfter ?? 600;
      void logEvent("warn", "signin.orgo_rate_limited", { data: { retryAfter: wait } });
      const res = json({ error: `Sign-in with Orgo is busy right now. Try again in ${Math.max(1, Math.ceil(wait / 60))} minutes, or use an API key instead.`, code: "signin_busy", retryAfter: wait }, 429);
      res.headers.set("Retry-After", String(wait));
      return res;
    }
    return errorResponse(err, req);
  }
}
