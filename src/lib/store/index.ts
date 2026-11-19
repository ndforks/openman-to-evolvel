/**
 * Picks the task store for a session: the database, scoped to `session.userId`. The local file
 * store is kept only for the dev user (`session.dev`) while the database is unconfigured or unreachable.
 */
import type { NextResponse } from "next/server";
import { dbConfigured, dbReachable } from "@/lib/db/client";
import { getSession, type Session } from "@/lib/session";
import { DbStore } from "./db-store";
import { fileStore } from "./file-store";
import type { Store } from "./types";

export type { Store, TaskMeta, TaskPatch, TaskRecord, TaskView } from "./types";
export { isValidTaskId, toSummary } from "./types";
export { fileStore } from "./file-store";
export { DbStore } from "./db-store";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue.");
  }
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("Storage is unavailable. Try again in a moment.");
  }
}

export async function storeForSession(session: Session): Promise<Store> {
  if (session.dev) {
    if (dbConfigured() && (await dbReachable())) return new DbStore(session.userId);
    console.warn("[store] database unreachable: the dev user falls back to the local file store");
    return fileStore();
  }
  if (!dbConfigured()) throw new StorageUnavailableError();
  return new DbStore(session.userId);
}

export interface RequestStore {
  store: Store;
  session: Session;
  /** Kept for callers written against the cookie-refreshing store; a no-op now. */
  finish<T extends NextResponse>(res: T): T;
}

/** The signed-in caller's store. Throws `UnauthorizedError` when signed out. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function storeFor(_req?: unknown): Promise<RequestStore> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return { store: await storeForSession(session), session, finish: (res) => res };
}
