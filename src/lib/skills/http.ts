/** Error shaping for the `/api/skills` routes. Every route calls `requireSession()` first and hands failures here. */
import { NextResponse } from "next/server";
import { DbError } from "@/lib/db/client";
import { OrgoError } from "@/lib/orgo/user-client";
import { SkillError } from "./index";
import { BodyTooLarge, readJsonLimited } from "@/lib/net/body";

const NO_STORE = { "Cache-Control": "no-store" };

export function ok(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function skillError(err: unknown, where: string): Response {
  if (err instanceof Response) return err;
  if (err instanceof SkillError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status, headers: NO_STORE });
  if (err instanceof OrgoError) {
    if (err.status === 401) return NextResponse.json({ error: "Orgo no longer accepts this sign-in. Sign in again.", code: "orgo_unauthorized" }, { status: 401, headers: NO_STORE });
    const status = err.status === 0 || err.status >= 500 ? 502 : err.status;
    return NextResponse.json({ error: err.message, code: err.code }, { status, headers: NO_STORE });
  }
  if (err instanceof DbError) {
    console.error(`[skills] ${where} database error:`, err.message);
    return NextResponse.json({ error: "Something went wrong with skills." }, { status: 500, headers: NO_STORE });
  }
  console.error(`[skills] ${where} failed:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong with skills." }, { status: 500, headers: NO_STORE });
}

/** JSON body, at most 12 MB (an 8 MB skill as base64 plus its text), limited before it is buffered. */
export async function body<T = Record<string, unknown>>(req: Request, max = 12 * 1024 * 1024): Promise<T> {
  try {
    return await readJsonLimited<T>(req, max);
  } catch (err) {
    if (err instanceof BodyTooLarge) throw new SkillError(err.message, "too_large", 413);
    throw new SkillError("The request body must be JSON.", "failed");
  }
}
