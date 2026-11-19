/**
 * Plumbing for route handlers that act as the signed-in user on Orgo: the session gate, the user's
 * Orgo client, and error shaping. A handler throws; this turns it into a JSON answer.
 */
import { connection, NextResponse, type NextRequest } from "next/server";
import { getAccount } from "@/lib/db/accounts";
import { orgoFor, requireSession, type Session } from "@/lib/session";
import { ComputerRequestError, type ComputerScope } from "./computers";
import { OrgoError, type OrgoClient } from "./user-client";
import { BodyTooLarge, readJsonLimited } from "@/lib/net/body";
import { logEvent } from "@/lib/observability/log";

export const NOT_CONFIGURED = "Cloud computers aren't connected: this account has no Orgo workspace yet.";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** A request this app refuses before it reaches Orgo. */
export class BadRequest extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown, req: Pick<NextRequest, "method" | "nextUrl">): Response {
  if (err instanceof Response) return err;
  if (err instanceof ComputerRequestError || err instanceof BadRequest) return json({ error: err.message }, err.status);
  if (err instanceof OrgoError) {
    // Orgo's sentence is written for the account owner and carries no secret, so it is passed on.
    // An unreachable Orgo or a 5xx is a bad gateway; a 401 means the user's key was revoked: sign in again.
    if (err.status === 401) return json({ error: "Orgo no longer accepts this sign-in. Sign in again.", code: "orgo_unauthorized" }, 401);
    const status = err.status === 0 || err.status >= 500 ? 502 : err.status;
    if (status === 502) {
      console.error(`[orgo] ${req.method} ${req.nextUrl.pathname}: Orgo ${err.status || "unreachable"} ${err.code ?? ""}`.trim());
      void logEvent("error", "orgo.request_failed", { error: err, data: { route: req.nextUrl.pathname, status: err.status } });
    }
    return json({ error: err.message, code: err.code }, status);
  }
  console.error(`[orgo] ${req.method} ${req.nextUrl.pathname} failed:`, err instanceof Error ? err.message : err);
  void logEvent("error", "orgo.request_failed", { error: err, data: { route: req.nextUrl.pathname, status: 500 } });
  return json({ error: "Something went wrong." }, 500);
}

export interface UserContext {
  session: Session;
  orgo: OrgoClient;
}

/** Runs a handler for the signed-in user with their Orgo client. Signed out: 401. */
export async function withUser(req: NextRequest, handler: (ctx: UserContext) => Promise<Response>): Promise<Response> {
  await connection(); // per request, never prerendered
  try {
    const session = await requireSession();
    const orgo = await orgoFor(session);
    return await handler({ session, orgo });
  } catch (err) {
    return errorResponse(err, req);
  }
}

/** JSON body, at most `max` bytes (default 1 MB), limited before it is buffered. */
export async function readJson(req: NextRequest, max = 1024 * 1024): Promise<unknown> {
  try {
    return await readJsonLimited(req, max);
  } catch (err) {
    if (err instanceof BodyTooLarge) throw new BadRequest(err.message, 413);
    throw new BadRequest("The request body must be JSON.");
  }
}

/**
 * Public origin of this app, for Stripe return URLs and the sign-in label: always `APP_PUBLIC_URL` when set.
 * Request headers (`Host`, `X-Forwarded-Host`) are never trusted for this. Without it (local development) the
 * URL the server itself was asked on.
 */
export function appOrigin(req: Pick<NextRequest, "nextUrl">): string {
  const configured = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured && /^https?:\/\//.test(configured)) return configured;
  return req.nextUrl.origin;
}

/**
 * The computers scope for a user: their workspace, and their home computer protected from changes.
 * Null when the account has no workspace yet (the routes then answer "not configured").
 */
export async function computerScope({ session, orgo }: UserContext): Promise<ComputerScope | null> {
  const workspaceId = orgo.workspaceId ?? session.workspaceId;
  if (!workspaceId) return null;
  const protectedIds: string[] = [];
  if (session.dev) {
    const envId = process.env.ORGO_COMPUTER_ID?.trim();
    if (envId) protectedIds.push(envId);
  } else {
    const account = await getAccount(session.userId).catch(() => null);
    if (account?.homeComputerId) protectedIds.push(account.homeComputerId);
  }
  return { client: orgo, workspaceId, protectedIds };
}
