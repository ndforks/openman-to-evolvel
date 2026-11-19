// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The session cookie: an AES-256-GCM sealed JSON of the `Session` fields plus an expiry, keyed by `SESSION_SECRET`.
 * HttpOnly, SameSite=Lax, 30 days. It never carries the Orgo key (that lives sealed in `accounts`).
 * No Next.js imports here, so the request gate and plain scripts can use it.
 */
import { keyBytes, openWith, sealWith } from "@/lib/crypto";
import type { Session } from "./index";

export const SESSION_COOKIE = "om_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // seconds
const AAD = "om_session.v1";
const HANDLE_AAD = "om_device.v1";
const PENDING_AAD = "om_signin.v1";

/** HttpOnly cookie that ties a pending device-code sign-in to the browser that started it. */
export const SIGNIN_COOKIE = "om_signin";

let cachedKey: Buffer | null = null;
function sessionKey(): Buffer {
  cachedKey ??= keyBytes(process.env.SESSION_SECRET, "SESSION_SECRET");
  return cachedKey;
}

interface Payload {
  s: Session;
  /** Expiry, seconds since the epoch. */
  e: number;
  /** Issued at, milliseconds since the epoch. Older cookies lack it; their issue time is `e - SESSION_MAX_AGE`. */
  i?: number;
}

function clean(session: Session): Session {
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    avatarUrl: session.avatarUrl ?? null,
    plan: session.plan,
    workspaceId: session.workspaceId ?? null,
    ...(session.dev ? { dev: true } : {}),
    ...(session.keyScope === "workspace" || session.keyScope === "account" ? { keyScope: session.keyScope } : {}),
    ...(session.via === "device" || session.via === "api_key" || session.via === "local" ? { via: session.via } : {}),
  };
}

export function encodeSession(session: Session, now = Date.now()): string {
  const payload: Payload = { s: clean(session), e: Math.floor(now / 1000) + SESSION_MAX_AGE, i: now };
  return sealWith(sessionKey(), JSON.stringify(payload), AAD);
}

/** The session in a cookie value and when it was issued (ms), or null when it is missing, expired, forged or unreadable. */
export function decodeSessionCookie(value: string | undefined | null, now = Date.now()): { session: Session; issuedAt: number } | null {
  if (!value) return null;
  try {
    const payload = JSON.parse(openWith(sessionKey(), value, AAD)) as Payload;
    if (!payload?.s?.userId || typeof payload.e !== "number" || payload.e * 1000 < now) return null;
    const issuedAt = typeof payload.i === "number" ? payload.i : (payload.e - SESSION_MAX_AGE) * 1000;
    return { session: clean(payload.s), issuedAt };
  } catch {
    return null;
  }
}

/** The session in a cookie value, or null when it is missing, expired, forged or unreadable. Does not check revocation. */
export function decodeSession(value: string | undefined | null, now = Date.now()): Session | null {
  return decodeSessionCookie(value, now)?.session ?? null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

/** An opaque poll handle for a device-code sign-in: the browser never sees Orgo's device code. */
export function sealDeviceHandle(deviceCode: string, expiresInSeconds: number): string {
  return sealWith(sessionKey(), JSON.stringify({ d: deviceCode, e: Math.floor(Date.now() / 1000) + expiresInSeconds }), HANDLE_AAD);
}

export function openDeviceHandle(handle: string): string | null {
  try {
    const payload = JSON.parse(openWith(sessionKey(), handle, HANDLE_AAD)) as { d?: string; e?: number };
    if (!payload.d || !payload.e || payload.e * 1000 < Date.now()) return null;
    return payload.d;
  } catch {
    return null;
  }
}

/** A started sign-in, kept sealed in the `om_signin` cookie so repeated clicks reuse it and only this browser can poll it. */
export interface PendingSignIn {
  handle: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  /** Expiry of Orgo's device code, seconds since the epoch. */
  expiresAt: number;
  /** When it was started, ms. */
  startedAt: number;
}

export function sealPendingSignIn(p: PendingSignIn): string {
  return sealWith(sessionKey(), JSON.stringify(p), PENDING_AAD);
}

export function openPendingSignIn(value: string | undefined | null, now = Date.now()): PendingSignIn | null {
  if (!value) return null;
  try {
    const p = JSON.parse(openWith(sessionKey(), value, PENDING_AAD)) as PendingSignIn;
    if (!p?.handle || !p.userCode || typeof p.expiresAt !== "number" || p.expiresAt * 1000 < now) return null;
    return p;
  } catch {
    return null;
  }
}
