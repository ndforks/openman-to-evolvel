/**
 * Sign-in settings shared by the request gate, the session code and the marketing site.
 * (The file keeps its old path because several areas import it; Supabase Auth is no longer used:
 * sign-in is "Sign in with Orgo", see `src/lib/session`.)
 */

import { devBypassEnabled } from "@/lib/session/bypass";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** True when the database's public settings are present (the data layer talks to it server side). */
export const isSupabaseConfigured = SUPABASE_URL !== "" && SUPABASE_PUBLISHABLE_KEY !== "";

/**
 * Development bypass (`OPENMAN_DEV_BYPASS=1`, see `src/lib/session/bypass.ts`): `/app` is open and the session is a dev
 * user built from `ORGO_API_KEY`. Server only (browsers learn it from `/api/auth/session`). Never on in a production
 * server: one with the bypass set refuses to start (`src/instrumentation.ts`). The old `NEXT_PUBLIC_AUTH_DISABLED` is not read.
 */
export const isAuthDisabled = typeof window === "undefined" && devBypassEnabled(process.env);

/** Where signed-in people land. */
export const APP_HOME = "/app";
export const SIGN_IN_PATH = "/signin";
export const WAITLIST_PATH = "/waitlist";

/**
 * Invite gate. `ALLOWED_EMAILS` is a comma-separated list read on the server only.
 * Unset or empty means everyone who is signed in may enter. `list` overrides the env (tests).
 */
export function isEmailAllowed(email: string | null | undefined, list: string | undefined = process.env.ALLOWED_EMAILS): boolean {
  const raw = list;
  if (!raw || raw.trim() === "") return true;
  if (!email) return false;
  const allowed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Only same-site paths may be used as a post-sign-in destination. Refuses anything with a control character,
 * whitespace or a backslash (browsers strip or rewrite those, so `/\t/evil.example` or `/\\evil.example` would
 * leave the site), and anything that does not resolve to this origin. Returns path + query + hash.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return APP_HOME;
  if (!next.startsWith("/") || /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff\\]/.test(next)) return APP_HOME;
  if (next.startsWith("//")) return APP_HOME;
  try {
    const base = "https://app.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return APP_HOME;
    const out = `${url.pathname}${url.search}${url.hash}`;
    return out.startsWith("/") && !out.startsWith("//") ? out : APP_HOME;
  } catch {
    return APP_HOME;
  }
}
