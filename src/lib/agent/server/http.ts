// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Shared plumbing for the task route handlers: session, store, error shapes, body parsing. */
import { connection, NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { requireSession, type Session } from "@/lib/session";
import { DbStore, StorageUnavailableError, isValidTaskId, storeForSession, type Store } from "@/lib/store";
import { DbError } from "@/lib/db/client";
import { BodyTooLarge, readJsonLimited } from "@/lib/net/body";
import type { TaskRole } from "@/lib/agent/types";
import { membershipFor } from "./collab";
import { primeConnection, primeConnectionFor } from "./connection";
import { liveRuntime, refreshOwner } from "./relay";

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export const notFound = () => jsonError("Task not found.", 404);

/** `requireSession()` throws a ready 401 Response; anything else thrown means the session could not be read. */
export async function sessionOrResponse(): Promise<{ session: Session } | { response: NextResponse }> {
  // Every caller answers per request: never let the build prerender a signed-in answer.
  await connection();
  try {
    return { session: await requireSession() };
  } catch (err) {
    if (err instanceof Response) {
      const body = await err.text().catch(() => "");
      let message = "Sign in to continue.";
      try {
        const parsed = JSON.parse(body) as { error?: unknown };
        if (typeof parsed.error === "string") message = parsed.error;
      } catch {
        // Keep the default.
      }
      return { response: jsonError(message, err.status || 401) };
    }
    console.error("[api] could not read the session:", err instanceof Error ? err.message : err);
    return { response: jsonError("Sign-in could not be checked.", 500) };
  }
}

/** Shapes an unexpected failure. Limit and validation errors from the data layer keep their message. */
export function errorResponse(req: NextRequest, err: unknown): NextResponse {
  if (err instanceof DbError && (err.code === "limit" || err.code === "invalid" || err.code === "too_large")) return jsonError(err.message, err.code === "too_large" ? 413 : 400);
  console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err);
  return jsonError("Something went wrong.", 500);
}

/**
 * Runs a handler for the signed-in caller (`requireSession()`), scoped to `session.userId`:
 * the store and the agent connection are that user's.
 */
export async function withStore(req: NextRequest, handler: (store: Store, session: Session) => Promise<NextResponse>): Promise<NextResponse> {
  const auth = await sessionOrResponse();
  if ("response" in auth) return auth.response;
  const { session } = auth;
  let store: Store;
  try {
    store = await storeForSession(session);
    await primeConnection(session);
  } catch (err) {
    if (err instanceof StorageUnavailableError) return jsonError(err.message, 503);
    console.error("[api] could not open the store:", err);
    return jsonError("Storage is unavailable.", 500);
  }
  refreshOwner(store);
  try {
    return await handler(store, session);
  } catch (err) {
    return errorResponse(req, err);
  }
}

/** Same as `withStore` for routes that need only the session (projects, knowledge, settings...). */
export async function withSession(req: NextRequest, handler: (session: Session) => Promise<NextResponse>): Promise<NextResponse> {
  const auth = await sessionOrResponse();
  if ("response" in auth) return auth.response;
  try {
    return await handler(auth.session);
  } catch (err) {
    return errorResponse(req, err);
  }
}

/** Parses and validates a JSON body. Returns a ready 400 response when it does not fit. */
export async function readBody<T>(req: NextRequest, schema: ZodType<T>, max = 2 * 1024 * 1024): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await readJsonLimited(req, max); // limited before buffering
  } catch (err) {
    if (err instanceof BodyTooLarge) return { error: jsonError(err.message, 413) };
    return { error: jsonError("The request body must be JSON.", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return { error: jsonError(`Invalid request. ${where}${issue?.message ?? ""}`.trim(), 400) };
  }
  return { data: parsed.data };
}

export interface TaskAccess {
  /** The store of the task's owner: the caller's own, or the owner's for a collaborator. */
  store: Store;
  session: Session;
  role: TaskRole;
}

/**
 * Runs a handler for one task the caller may open: their own (role "owner"), or one they were invited to
 * (role "collaborator", through `task_members`, with the owner's store and agent connection, so the owner's
 * account pays). `ownerOnly` routes answer 403 to collaborators. Anyone else gets 404, as for a missing task.
 */
export async function withTask(req: NextRequest, id: string, handler: (access: TaskAccess) => Promise<NextResponse>, opts: { ownerOnly?: boolean } = {}): Promise<NextResponse> {
  return withStore(req, async (own, session) => {
    if (!isValidTaskId(id)) return notFound();
    if (liveRuntime(own, id) || (await own.getTask(id))) return handler({ store: own, session, role: "owner" });
    if (own.kind !== "supabase") return notFound();
    const member = await membershipFor(id, session);
    if (!member) return notFound();
    if (opts.ownerOnly) return jsonError("Only the task's owner can do this.", 403);
    const store = new DbStore(member.ownerId);
    // The owner's agent runs the collaborator's messages: load the owner's connection (never the env setup).
    await primeConnectionFor(member.ownerId);
    if (!(await store.getTask(id))) return notFound();
    return handler({ store, session, role: "collaborator" });
  });
}
