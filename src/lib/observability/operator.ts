/**
 * Who may see the operator page (`/app/admin`) and its API. Reuses the staging owner and invite mechanism
 * (`src/lib/session/invites.ts`) rather than adding a second one:
 *
 * 1. With the invite gate on (`INVITE_GATE=1`, staging and production): the invite list's `owner` (the first account
 *    that signed in to the empty list). Emails are shown.
 * 2. `OPERATOR_USER_IDS` (comma-separated Orgo user ids): extra operators, or the operator of a deployment that runs
 *    without the invite gate. Emails are masked for them.
 * 3. Local development (`devUserEnabled()`: gate off, not production, loopback request): the dev user counts as the
 *    owner, because it is the only identity there is and the database it reads is the developer's own.
 *
 * Everyone else gets 404 (the page does not admit it exists).
 */
import { requireSession, devUserEnabled, type Session } from "@/lib/session";
import { inviteGateOn, roleOf } from "@/lib/session/invites";

export interface Operator {
  session: Session;
  /** Owner: may see emails and manage the invite list. */
  owner: boolean;
  via: "invite-owner" | "operator-env" | "dev";
}

export class NotOperator extends Error {
  readonly status = 404;
  constructor() {
    super("Not found.");
  }
}

function envOperators(): Set<string> {
  return new Set(
    (process.env.OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function operatorFor(session: Session): Promise<Operator | null> {
  if (session.dev && devUserEnabled()) return { session, owner: true, via: "dev" };
  if (inviteGateOn()) {
    const role = await roleOf(session.userId, session.email).catch(() => null);
    if (role === "owner") return { session, owner: true, via: "invite-owner" };
  }
  if (envOperators().has(session.userId)) return { session, owner: false, via: "operator-env" };
  return null;
}

/** For route handlers: the operator, or throws (401 signed out via requireSession, 404 otherwise). */
export async function requireOperator(): Promise<Operator> {
  const session = await requireSession();
  const op = await operatorFor(session);
  if (!op) throw new NotOperator();
  return op;
}

/** "jane.doe@example.com" -> "j•••@example.com". */
export function maskEmail(email: string | null): string | null {
  if (!email) return email;
  const at = email.indexOf("@");
  return at > 0 ? `${email[0]}•••${email.slice(at)}` : "•••";
}
