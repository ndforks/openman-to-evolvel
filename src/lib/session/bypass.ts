/**
 * The two ways in that skip Orgo's approval page, as pure decisions over an env object (testable, no Next imports).
 *
 * 1. Development bypass, `OPENMAN_DEV_BYPASS=1` (was `NEXT_PUBLIC_AUTH_DISABLED=1`, now refused): `/app` opens
 *    without signing in, as a dev user built from `ORGO_API_KEY`. `next dev` only. A production server with it set
 *    (or with the old name set) refuses to start (`assertSafeStartup`, called from `src/instrumentation.ts`).
 * 2. Local sign-in, `OPENMAN_LOCAL_SIGNIN=1` plus `ORGO_API_KEY`: for someone running OpenMan on their own machine.
 *    The sign-in screen offers "Sign in with this computer's Orgo key", which signs in exactly like a pasted API key
 *    (the key is checked with Orgo, the session is a real one). Offered only when all of these hold:
 *      - the server listens on a loopback address (`next dev|start -H 127.0.0.1`; Next records it in
 *        `__NEXT_PRIVATE_ORIGIN`; `localhost` is not accepted because Next writes that when no `-H` was given);
 *      - `APP_PUBLIC_URL` is unset or itself a loopback address;
 *      - the request was addressed to and came from loopback (checked per request in the route).
 *    It works in production builds, since a self-hoster runs `next start`; a production server whose
 *    `APP_PUBLIC_URL` is public refuses to start with it set.
 */

export type Env = Record<string, string | undefined>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);
/** Literal loopback addresses only: what a server bound with `-H 127.0.0.1` (or `::1`) reports. */
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1"]);

/** Host part of a Host header or URL host, lowercased, without port or IPv6 brackets. */
export function hostOnly(value: string | null | undefined): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw.startsWith("[")) return raw.slice(1, raw.indexOf("]") > 0 ? raw.indexOf("]") : undefined);
  return raw.replace(/:\d+$/, "");
}

export function isLoopbackHost(value: string | null | undefined): boolean {
  return LOOPBACK_HOSTS.has(hostOnly(value));
}

function flag(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

const isProduction = (env: Env) => env.NODE_ENV === "production";

/** The development bypass was asked for, under its current or its old name. */
export function devBypassRequested(env: Env): boolean {
  return flag(env.OPENMAN_DEV_BYPASS) || flag(env.NEXT_PUBLIC_AUTH_DISABLED);
}

/** The development bypass is on: `OPENMAN_DEV_BYPASS=1` and not a production server. The old name no longer turns it on. */
export function devBypassEnabled(env: Env): boolean {
  return flag(env.OPENMAN_DEV_BYPASS) && !isProduction(env);
}

/** The address the server listens on, as Next recorded it at start (`http://127.0.0.1:3002`), or null. */
export function boundHost(env: Env): string | null {
  const origin = env.__NEXT_PRIVATE_ORIGIN?.trim();
  if (!origin) return null;
  try {
    return hostOnly(new URL(origin).host);
  } catch {
    return null;
  }
}

function publicUrlIsLoopback(env: Env): boolean {
  const url = env.APP_PUBLIC_URL?.trim();
  if (!url) return true;
  try {
    return isLoopbackHost(new URL(url).host);
  } catch {
    return false;
  }
}

export type LocalSignInState = { enabled: true } | { enabled: false; reason: "off" | "no_key" | "not_loopback_bind" | "public_url" };

/** Whether this server may offer local sign-in at all (the request itself is checked separately). */
export function localSignInState(env: Env): LocalSignInState {
  if (!flag(env.OPENMAN_LOCAL_SIGNIN)) return { enabled: false, reason: "off" };
  if (!env.ORGO_API_KEY?.trim()) return { enabled: false, reason: "no_key" };
  if (!publicUrlIsLoopback(env)) return { enabled: false, reason: "public_url" };
  const bound = boundHost(env);
  if (!bound || !LOOPBACK_IPS.has(bound)) return { enabled: false, reason: "not_loopback_bind" };
  return { enabled: true };
}

/** A request addressed to this machine from this machine: Host and every `X-Forwarded-For` entry are loopback. */
export function isLoopbackRequest(headers: Pick<Headers, "get">): boolean {
  if (!isLoopbackHost(headers.get("host"))) return false;
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost && !isLoopbackHost(forwardedHost)) return false;
  const fwd = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return fwd.every((a) => isLoopbackHost(a));
}

/** Problems that must stop a server from starting, and warnings worth a line in the log. */
export function startupProblems(env: Env): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (isProduction(env)) {
    if (flag(env.OPENMAN_DEV_BYPASS))
      errors.push("OPENMAN_DEV_BYPASS is set. It opens the app without signing in and is for `next dev` only. Remove it from this server's environment.");
    if (flag(env.NEXT_PUBLIC_AUTH_DISABLED))
      errors.push("NEXT_PUBLIC_AUTH_DISABLED is set. This old sign-in bypass is no longer supported. Remove it from the environment (and rebuild if it was set at build time).");
    if (flag(env.OPENMAN_LOCAL_SIGNIN) && !publicUrlIsLoopback(env))
      errors.push("OPENMAN_LOCAL_SIGNIN is set but APP_PUBLIC_URL is a public address. Local sign-in is only for a server on your own machine; remove it.");
  } else if (flag(env.NEXT_PUBLIC_AUTH_DISABLED)) {
    warnings.push("NEXT_PUBLIC_AUTH_DISABLED is no longer read. Rename it to OPENMAN_DEV_BYPASS=1 in .env.local to keep the development bypass.");
  }
  if (flag(env.OPENMAN_LOCAL_SIGNIN) && !env.ORGO_API_KEY?.trim()) warnings.push("OPENMAN_LOCAL_SIGNIN is set but ORGO_API_KEY is empty, so local sign-in is off.");
  if (flag(env.OPENMAN_LOCAL_SIGNIN) && publicUrlIsLoopback(env) && env.ORGO_API_KEY?.trim()) {
    const bound = boundHost(env);
    if (bound && !LOOPBACK_IPS.has(bound)) warnings.push("OPENMAN_LOCAL_SIGNIN is set but the server does not listen on 127.0.0.1, so local sign-in is off. Start it with -H 127.0.0.1.");
  }
  return { errors, warnings };
}

/** Throws (stopping the server) when the environment enables a bypass a production server must never have. */
export function assertSafeStartup(env: Env): void {
  const { errors } = startupProblems(env);
  if (errors.length) throw new Error(`OpenMan will not start with an unsafe sign-in setting:\n- ${errors.join("\n- ")}`);
}
