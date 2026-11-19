// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Budgets for starting "Sign in with Orgo". Orgo allows 20 device-flow starts an hour per calling server
 * address, shared by everyone who signs in here, so an anonymous visitor must not be able to spend them all.
 *
 * - Reuse: a browser that started a sign-in in the last few minutes gets the same pending code back (cookie
 *   `om_signin`, sealed), with no call to Orgo. Repeated clicks cost nothing.
 * - Per client address: a few starts per 10 minutes.
 * - Global: at most `GLOBAL_PER_HOUR` starts per hour for the whole server, below Orgo's 20, so a handful
 *   always stay in reserve for Orgo-side retries and the CLI.
 * Counters live in the database (`api_rate_limits` through `api_rate_hit`), so they hold across processes
 * and restarts. Server only.
 */
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";

export const PER_CLIENT = 3;
export const PER_CLIENT_WINDOW_S = 10 * 60;
export const GLOBAL_PER_HOUR = 15;
export const REUSE_WINDOW_S = 10 * 60;

export class SignInBusy extends Error {
  constructor(
    message: string,
    readonly retryAfter: number,
  ) {
    super(message);
  }
}

/**
 * The client address as the edge saw it. Behind Orgo's public URL (one proxy hop) that is the last entry of
 * `X-Forwarded-For`, which the proxy appends; earlier entries are whatever the client sent and are ignored.
 * `TRUSTED_PROXY_HOPS` sets how many proxies append (default 1). IPv6 addresses are grouped by /64.
 */
export function clientAddress(headers: Headers): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const list = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let ip = list.length >= hops ? list[list.length - hops] : (list[0] ?? headers.get("x-real-ip") ?? "direct");
  ip = ip.replace(/^\[|\]:?\d*$/g, "").replace(/^::ffff:/i, "");
  if (ip.includes(":")) ip = `${ip.split(":").slice(0, 4).join(":")}::/64`;
  return ip;
}

function windowStart(seconds: number, now = Date.now()): string {
  return new Date(Math.floor(now / (seconds * 1000)) * seconds * 1000).toISOString();
}

function secondsLeft(seconds: number, now = Date.now()): number {
  const end = (Math.floor(now / (seconds * 1000)) + 1) * seconds * 1000;
  return Math.max(1, Math.ceil((end - now) / 1000));
}

async function hit(bucket: string, seconds: number): Promise<number> {
  const { data, error } = await db().rpc("api_rate_hit", { p_bucket: bucket, p_window: windowStart(seconds) });
  if (error) throw new SignInBusy("Sign-in is unavailable for a moment. Try again shortly.", 30);
  return Number(data);
}

const minutes = (s: number) => `${Math.max(1, Math.ceil(s / 60))} minute${Math.ceil(s / 60) === 1 ? "" : "s"}`;

/** Spends one start from the client's and the global budget, or throws `SignInBusy` with a clear message. */
export async function takeSignInStart(headers: Headers, opts: { prefix?: string } = {}): Promise<void> {
  const prefix = opts.prefix ?? "signin"; // tests use their own buckets
  const ip = clientAddress(headers);
  const key = createHash("sha256").update(`signin:${ip}`).digest("hex").slice(0, 32);
  const mine = await hit(`${prefix}:ip:${key}`, PER_CLIENT_WINDOW_S);
  if (mine > PER_CLIENT) {
    const wait = secondsLeft(PER_CLIENT_WINDOW_S);
    throw new SignInBusy(`Too many sign-in attempts from your network. Try again in ${minutes(wait)}.`, wait);
  }
  const all = await hit(`${prefix}:global`, 3600);
  if (all > GLOBAL_PER_HOUR) {
    const wait = secondsLeft(3600);
    throw new SignInBusy(`Sign-in is busy right now: the hourly limit for new sign-ins has been reached. Try again in ${minutes(wait)}.`, wait);
  }
}

/** Pasted-key sign-ins per client address per 10 minutes (each one asks Orgo who the key belongs to). */
export const KEY_PER_CLIENT = 10;

/** Spends one pasted-key attempt from the client's budget, or throws `SignInBusy`. */
export async function takeKeyAttempt(headers: Headers, opts: { prefix?: string } = {}): Promise<void> {
  const prefix = opts.prefix ?? "signin-key";
  const key = createHash("sha256").update(`signin-key:${clientAddress(headers)}`).digest("hex").slice(0, 32);
  if ((await hit(`${prefix}:ip:${key}`, PER_CLIENT_WINDOW_S)) > KEY_PER_CLIENT) {
    const wait = secondsLeft(PER_CLIENT_WINDOW_S);
    throw new SignInBusy(`Too many key sign-in attempts from your network. Try again in ${minutes(wait)}.`, wait);
  }
}
