// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Error reporting for route handlers. Wrap a handler and every response carries `x-request-id`; a thrown error or a
 * 5xx answer is recorded in the operator log under that id, and the client gets the id in the JSON body
 * (`{ error, requestId }`) so a person can quote it to support.
 *
 *   export const GET = withErrorReporting("health.deep", async (req) => json({ ok: true }));
 *
 * A thrown `Response` (e.g. `requireSession()`'s 401) is passed through untouched apart from the header.
 */
import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { logEvent, newRequestId } from "./log";

export interface RequestMeta {
  requestId: string;
  startedAt: number;
}

/** 503 means "not configured / not ready" in this codebase (and the deep health check's "unhealthy"): not a failure to report. */
const reportable = (status: number) => status >= 500 && status !== 503;

type Handler<C> = (req: NextRequest, ctx: C, meta: RequestMeta) => Promise<Response> | Response;

function withId(res: Response, requestId: string): Response {
  try {
    res.headers.set("x-request-id", requestId);
    return res;
  } catch {
    // Immutable headers (a fetched Response passed through): copy it.
    const copy = new Response(res.body, res);
    copy.headers.set("x-request-id", requestId);
    return copy;
  }
}

async function addIdToBody(res: Response, requestId: string): Promise<Response> {
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) return withId(res, requestId);
  try {
    const body = (await res.clone().json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const headers = new Headers(res.headers);
      headers.delete("content-length");
      headers.set("x-request-id", requestId);
      return NextResponse.json({ ...(body as Record<string, unknown>), requestId }, { status: res.status, headers });
    }
  } catch {
    /* not JSON after all */
  }
  return withId(res, requestId);
}

export function withErrorReporting<C = unknown>(event: string, handler: Handler<C>): (req: NextRequest, ctx: C) => Promise<Response> {
  return async (req: NextRequest, ctx: C) => {
    const meta: RequestMeta = { requestId: newRequestId(), startedAt: Date.now() };
    const route = `${req.method} ${req.nextUrl.pathname}`;
    try {
      const res = await handler(req, ctx, meta);
      if (reportable(res.status)) {
        await logEvent("error", `${event}.5xx`, { requestId: meta.requestId, durationMs: Date.now() - meta.startedAt, data: { route, status: res.status } });
        return addIdToBody(res, meta.requestId);
      }
      return withId(res, meta.requestId);
    } catch (err) {
      // Next's own control flow (a prerender ending at `connection()`, redirects, not-found) is not a failure: hand it back.
      unstable_rethrow(err);
      if (err instanceof Response) {
        if (reportable(err.status)) await logEvent("error", `${event}.5xx`, { requestId: meta.requestId, durationMs: Date.now() - meta.startedAt, data: { route, status: err.status } });
        return withId(err, meta.requestId);
      }
      await logEvent("error", `${event}.failed`, { requestId: meta.requestId, durationMs: Date.now() - meta.startedAt, error: err, data: { route } });
      return NextResponse.json(
        { error: "Something went wrong. Quote this id if you contact support.", requestId: meta.requestId },
        { status: 500, headers: { "Cache-Control": "no-store", "x-request-id": meta.requestId } },
      );
    }
  };
}

/** For an existing `catch` block: records the error and returns the request id to put in the answer. */
export async function reportError(event: string, err: unknown, fields: { userId?: string | null; taskId?: string | null; data?: Record<string, unknown> } = {}): Promise<string> {
  const requestId = newRequestId();
  await logEvent("error", event, { ...fields, requestId, error: err });
  return requestId;
}
