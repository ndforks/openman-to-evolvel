/**
 * The `/app/**` gate as a pure decision, so it can be tested without a server or a change to the shared env.
 * `src/proxy.ts` turns the decision into a response.
 */
import { isEmailAllowed } from "@/lib/supabase/config";
import { decodeSession } from "./cookie";

export type GateDecision =
  | { action: "allow" }
  /** No (valid) session: go to the sign-in page, which returns to `next` afterwards. */
  | { action: "signin"; location: string }
  /** Signed in, but not on the invite list: drop the cookie and go to the waitlist. */
  | { action: "waitlist"; location: string; clearCookie: true };

export function gateDecision(input: { pathname: string; search: string; cookie: string | undefined; authDisabled: boolean; allowedEmails?: string }): GateDecision {
  if (input.authDisabled) return { action: "allow" };
  const session = decodeSession(input.cookie);
  if (!session) {
    const next = `${input.pathname}${input.search}`;
    return { action: "signin", location: next === "/app" ? "/signin" : `/signin?${new URLSearchParams({ next }).toString()}` };
  }
  if (!isEmailAllowed(session.email, input.allowedEmails)) return { action: "waitlist", location: "/waitlist", clearCookie: true };
  return { action: "allow" };
}
