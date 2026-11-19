/** Plumbing for the `/api/recordings` routes: every handler runs inside `route()`, which calls `requireSession()` first. */
import { connection, NextResponse } from "next/server";
import { DbError } from "@/lib/db/client";
import { OrgoError } from "@/lib/orgo/user-client";
import { requireSession, type Session } from "@/lib/session";
import { SkillError } from "@/lib/skills";
import { RecordingError } from "./server";
import { BodyTooLarge, readJsonLimited } from "@/lib/net/body";

const NO_STORE = { "Cache-Control": "no-store" };

export function ok(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function toResponse(err: unknown, where: string): Response {
  if (err instanceof Response) return err;
  if (err instanceof RecordingError) return NextResponse.json({ error: err.message, code: err.code, ...(err.extra ?? {}) }, { status: err.status, headers: NO_STORE });
  if (err instanceof SkillError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status, headers: NO_STORE });
  if (err instanceof OrgoError) {
    if (err.status === 401) return NextResponse.json({ error: "Orgo no longer accepts this sign-in. Sign in again.", code: "orgo_unauthorized" }, { status: 401, headers: NO_STORE });
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status === 0 || err.status >= 500 ? 502 : err.status, headers: NO_STORE });
  }
  if (err instanceof BodyTooLarge) return NextResponse.json({ error: err.message, code: "too_large" }, { status: 413, headers: NO_STORE });
  if (err instanceof DbError) {
    // A size cap enforced by the database (screenshots per recording, recordings per user).
    if (/limit reached/.test(err.message)) return NextResponse.json({ error: "This recording (or your account) holds as many recordings or screenshots as it can.", code: "too_many" }, { status: 413, headers: NO_STORE });
    console.error(`[recordings] ${where} database error:`, err.message);
    return NextResponse.json({ error: "Something went wrong with the recording." }, { status: 500, headers: NO_STORE });
  }
  // Only the message: never the request, which can carry screenshots or typed text.
  console.error(`[recordings] ${where} failed:`, err instanceof Error ? err.message : String(err));
  return NextResponse.json({ error: "Something went wrong with the recording." }, { status: 500, headers: NO_STORE });
}

export async function route(where: string, fn: (session: Session) => Promise<Response>): Promise<Response> {
  await connection(); // per request, never prerendered
  try {
    const session = await requireSession();
    return await fn(session);
  } catch (err) {
    return toResponse(err, where);
  }
}

/** JSON body, at most `max` bytes (default 2 MB: one screenshot as base64 or one part of the timeline). */
export async function json<T = Record<string, unknown>>(req: Request, max = 2 * 1024 * 1024): Promise<T> {
  try {
    return await readJsonLimited<T>(req, max);
  } catch (err) {
    if (err instanceof BodyTooLarge) throw err;
    throw new RecordingError("The request body must be JSON.");
  }
}
