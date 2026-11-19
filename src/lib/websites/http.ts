/** Plumbing for `/api/websites/**`: session, the site row, and error shapes. Server only. */
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession, withStore } from "@/lib/agent/server/http";
import { getWebsiteRow, type WebsiteRow } from "@/lib/db/websites";
import { OrgoError } from "@/lib/orgo/user-client";
import type { Session } from "@/lib/session";
import type { Store } from "@/lib/store";
import { SiteError } from "./server";

export type IdParams = { params: Promise<{ id: string }> };

function shape(err: unknown): NextResponse | null {
  if (err instanceof Response) return err as NextResponse;
  if (err instanceof SiteError) return NextResponse.json({ error: err.message, code: err.status === 503 ? "paused" : undefined }, { status: err.status });
  if (err instanceof OrgoError) return jsonError(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
  return null;
}

async function guarded(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const known = shape(err);
    if (known) return known;
    throw err;
  }
}

/** Runs `fn` for the caller's own site `id` (404 otherwise). Every call starts with `requireSession()` inside `withSession`. */
export function siteRoute(req: NextRequest, ctx: IdParams, fn: (session: Session, row: WebsiteRow) => Promise<NextResponse>) {
  return withSession(req, (session) =>
    guarded(async () => {
      const { id } = await ctx.params;
      const row = await getWebsiteRow(session.userId, id);
      if (!row) return jsonError("Website not found.", 404);
      return fn(session, row);
    }),
  );
}

/** Same with the task store (for routes that start runs or read task status). */
export function siteStoreRoute(req: NextRequest, ctx: IdParams, fn: (session: Session, row: WebsiteRow, store: Store) => Promise<NextResponse>) {
  return withStore(req, (store, session) =>
    guarded(async () => {
      const { id } = await ctx.params;
      const row = await getWebsiteRow(session.userId, id);
      if (!row) return jsonError("Website not found.", 404);
      return fn(session, row, store);
    }),
  );
}

export function sessionRoute(req: NextRequest, fn: (session: Session) => Promise<NextResponse>) {
  return withSession(req, (session) => guarded(() => fn(session)));
}

export function storeRoute(req: NextRequest, fn: (store: Store, session: Session) => Promise<NextResponse>) {
  return withStore(req, (store, session) => guarded(() => fn(store, session)));
}

export const noStore = { "Cache-Control": "no-store" };
