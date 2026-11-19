// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * `useSession()`: the browser's view of "Sign in with Orgo", shared by every area.
 * (The file keeps its old path because several areas import it; Supabase Auth is no longer used.)
 * Reads `GET /api/auth/session` once per page and after sign-in/sign-out; the cookie itself is HttpOnly.
 */
import { useSyncExternalStore } from "react";
import { isSupabaseConfigured } from "./config";

export { isSupabaseConfigured };

/** The signed-in person, as the server's session cookie names them. */
export interface AppSession {
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  plan: string;
  workspaceId: string | null;
  dev?: boolean;
  keyScope?: "account" | "workspace";
  via?: "device" | "api_key" | "local";
}

/** Kept in the shape older components read (`user.email`, `user.user_metadata.full_name`). */
export interface AppUser {
  id: string;
  email: string;
  user_metadata: { full_name: string; name: string; avatar_url: string | null };
}

interface SessionSnapshot {
  session: AppSession | null;
  user: AppUser | null;
  loading: boolean;
  /** The server runs the development bypass (`OPENMAN_DEV_BYPASS=1`). */
  authDisabled: boolean;
  /** This browser may use local sign-in (`OPENMAN_LOCAL_SIGNIN=1` on a server on this machine). */
  localSignIn: boolean;
}

const serverSnapshot: SessionSnapshot = { session: null, user: null, loading: true, authDisabled: false, localSignIn: false };
let snapshot: SessionSnapshot = serverSnapshot;
const listeners = new Set<() => void>();
let started = false;

function publish(next: { session: AppSession | null; loading: boolean; authDisabled?: boolean; localSignIn?: boolean }) {
  const same = JSON.stringify(next.session) === JSON.stringify(snapshot.session);
  const authDisabled = next.authDisabled ?? snapshot.authDisabled;
  const localSignIn = next.localSignIn ?? snapshot.localSignIn;
  if (same && next.loading === snapshot.loading && authDisabled === snapshot.authDisabled && localSignIn === snapshot.localSignIn) return;
  const session = same ? snapshot.session : next.session;
  snapshot = { session, loading: next.loading, user: same ? snapshot.user : toUser(session), authDisabled, localSignIn };
  listeners.forEach((listener) => listener());
}

/** Re-reads the session from the server (after sign-in, sign-out, or when another tab changed it). */
export async function refreshSession(): Promise<AppSession | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    const body = res.ok ? ((await res.json()) as { session?: AppSession | null; authDisabled?: boolean; localSignIn?: boolean }) : null;
    const session = body?.session ?? null;
    publish({ session, loading: false, authDisabled: body?.authDisabled === true, localSignIn: body?.localSignIn === true });
    return session;
  } catch {
    publish({ session: snapshot.session, loading: false });
    return snapshot.session;
  }
}

function start() {
  if (started) return;
  started = true;
  void refreshSession();
  window.addEventListener("focus", () => void refreshSession());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export interface UseSession {
  /** The session, or null when signed out. */
  session: AppSession | null;
  user: AppUser | null;
  /** True until the session has been read from the server. */
  loading: boolean;
  /** True when the server runs the development bypass (`OPENMAN_DEV_BYPASS=1`): `/app` is open as the dev user. */
  authDisabled: boolean;
  /** True when this browser may use local sign-in (see `src/lib/session/bypass.ts`). */
  localSignIn: boolean;
  signOut: () => Promise<void>;
}

async function signOut() {
  await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  publish({ session: null, loading: false });
}

function toUser(session: AppSession | null): AppUser | null {
  if (!session) return null;
  return { id: session.userId, email: session.email, user_metadata: { full_name: session.name, name: session.name, avatar_url: session.avatarUrl ?? null } };
}

/** Current sign-in state. Safe in any client component; every caller shares one subscription. */
export function useSession(): UseSession {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
  return {
    session: current.session,
    user: current.user,
    loading: current.loading,
    authDisabled: current.authDisabled,
    localSignIn: current.localSignIn,
    signOut,
  };
}
