/**
 * Cross-site request forgery check for cookie-authenticated API routes, as a pure decision (used by `src/proxy.ts`).
 *
 * The session cookie is SameSite=Lax, which already keeps it off cross-site POSTs from other sites; this is the
 * second layer (old browsers, same-site sibling hosts such as other `*.web.orgo.dev` apps, top-level GET-to-POST tricks):
 * a request with an unsafe method that carries the session cookie must say it comes from this origin
 * (`Origin`), or at least not from another site (`Sec-Fetch-Site`). Requests without the cookie (bearer-token API,
 * vendor webhooks, the cron worker) are not affected.
 */
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function origins(selfOrigin: string): Set<string> {
  const set = new Set<string>([selfOrigin]);
  const configured = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      set.add(new URL(configured).origin);
    } catch {
      // ignored
    }
  }
  return set;
}

/** A reason to refuse, or null to let the request through. */
export function csrfRefusal(input: { method: string; headers: Headers; hasSessionCookie: boolean; selfOrigin: string }): string | null {
  if (SAFE.has(input.method.toUpperCase()) || !input.hasSessionCookie) return null;
  const origin = input.headers.get("origin");
  if (origin && origin !== "null") {
    if (origins(input.selfOrigin).has(origin)) return null;
    // Behind a proxy the server may see itself as http://localhost:PORT; the browser's Host is the public one.
    const host = input.headers.get("x-forwarded-host") ?? input.headers.get("host");
    try {
      if (host && new URL(origin).host === host) return null;
    } catch {
      // fall through
    }
    return "This request came from another site and was refused.";
  }
  if (origin === "null") return "This request came from another site and was refused.";
  const site = input.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return "This request came from another site and was refused.";
  return null;
}
