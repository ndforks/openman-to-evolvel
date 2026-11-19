/** Shared plumbing for `/api/browser/*`: the caller's own home computer and Orgo client, and error shapes. Server only. */
import { NextResponse } from "next/server";
import { computerFor, orgoClientFor, primeConnection } from "@/lib/agent/server/connection";
import { jsonError } from "@/lib/agent/server/http";
import type { OrgoClient } from "@/lib/orgo/user-client";
import type { Session } from "@/lib/session";
import { BrowserError } from "./index";

/** The caller's home computer (never another user's; the env computer only for the dev user, per `connection.ts`). */
export async function homeOf(session: Session): Promise<{ orgo: OrgoClient; computerId: string } | NextResponse> {
  await primeConnection(session);
  const orgo = orgoClientFor(session.userId);
  const computerId = computerFor(session.userId)?.computerId;
  if (!orgo || !computerId) return jsonError("Your agent computer isn't set up yet, so its browser can't be managed.", 409);
  return { orgo, computerId };
}

export function browserFailure(err: unknown): NextResponse {
  if (err instanceof BrowserError) return jsonError(err.message, err.status);
  throw err;
}

export const noStore = { "Cache-Control": "no-store" };
