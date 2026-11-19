/**
 * Where each user's agent lives. Signed-in users run on the Hermes server of their own home
 * computer, read from their account (base URL plus the sealed key, opened with `@/lib/crypto`).
 * The dev user, and the local file store's owner, use the env settings exactly as before.
 *
 * The relay asks synchronously, so every request primes the cache first (`primeConnection`).
 */
import { open } from "@/lib/crypto";
import { getAccount } from "@/lib/db/accounts";
import { OrgoClient } from "@/lib/orgo/user-client";
import { devUserEnabled, type Session } from "@/lib/session";
import { computerConfig, type ComputerConfig } from "./computer";
import { hermesConfig, type HermesConfig } from "./hermes";

interface Connection {
  dev: boolean;
  hermes: HermesConfig | null;
  computer: ComputerConfig | null;
  /** The owner's Orgo key and workspace, for work the relay does on their computers (never sent anywhere else). */
  orgo: { apiKey: string; workspaceId: string | null } | null;
  /** Why there is no agent, shown to the user when a run cannot start. */
  missing?: string;
  at: number;
}

const TTL_MS = 60_000;
const g = globalThis as typeof globalThis & { __omConnections?: Map<string, Connection> };
const cache = (g.__omConnections ??= new Map());

export const NOT_SET_UP = "Your agent computer isn't set up yet. Open Computers to create it, then try again.";

function openSafe(sealed: string | null): string | null {
  if (!sealed) return null;
  try {
    return open(sealed);
  } catch (err) {
    console.warn("[connection] could not open a stored key:", err instanceof Error ? err.message : err);
    return null;
  }
}

function envOrgo(): Connection["orgo"] {
  const apiKey = process.env.ORGO_API_KEY?.trim();
  return apiKey ? { apiKey, workspaceId: process.env.ORGO_WORKSPACE_ID?.trim() || null } : null;
}

async function resolve(session: Session): Promise<Connection> {
  const at = Date.now();
  const account = await getAccount(session.userId).catch((err) => {
    console.warn("[connection] could not read the account:", err instanceof Error ? err.message : err);
    return null;
  });
  const hermesKey = openSafe(account?.hermesKeyEnc ?? null);
  const hermes: HermesConfig | null = account?.hermesBaseUrl
    ? { baseUrl: account.hermesBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, ""), apiKey: hermesKey ?? "" }
    : null;
  const orgoKey = openSafe(account?.orgoKeyEnc ?? null);
  const computer: ComputerConfig | null =
    account?.homeComputerId && orgoKey
      ? { baseUrl: (process.env.ORGO_API_BASE?.trim() || "https://www.orgo.ai/api").replace(/\/+$/, ""), computerId: account.homeComputerId, token: orgoKey }
      : null;
  const orgo = orgoKey ? { apiKey: orgoKey, workspaceId: account?.workspaceId ?? session.workspaceId ?? null } : null;
  // The dev user: whatever their account names, the env setup for the rest (and the mock without either).
  if (session.dev && devUserEnabled()) return { dev: !hermes, hermes, computer: computer ?? computerConfig(), orgo: orgo ?? envOrgo(), at };
  return { dev: false, hermes, computer, orgo, missing: hermes ? undefined : NOT_SET_UP, at };
}

/** Loads (or refreshes) the caller's connection. Cheap when cached. */
export async function primeConnection(session: Session): Promise<void> {
  const known = cache.get(session.userId);
  if (known && Date.now() - known.at < TTL_MS) return;
  const next = await resolve(session);
  cache.set(session.userId, next);
}

/**
 * For work without a request from the owner (a public share page): loads their account's
 * connection unless one is already cached. Never grants the env setup.
 */
export async function primeConnectionFor(userId: string): Promise<void> {
  if (cache.has(userId)) return;
  // Stamped as expired, so the owner's own next request resolves it again with their real session.
  cache.set(userId, { ...(await resolve({ userId, email: "", name: "", plan: "", workspaceId: null })), at: 0 });
}

/** Drops the cached connection, e.g. right after the user's computer was set up. */
export function forgetConnection(userId: string): void {
  cache.delete(userId);
}

export type HermesTarget = { kind: "hermes"; cfg: HermesConfig } | { kind: "mock" } | { kind: "missing"; reason: string };

/** The agent backend for an owner. `"local"` (file store) and dev users get the env setup. */
export function hermesTarget(ownerId: string): HermesTarget {
  const c = ownerId === "local" ? undefined : cache.get(ownerId);
  if ((ownerId === "local" || c?.dev) && devUserEnabled()) {
    const env = hermesConfig();
    return env ? { kind: "hermes", cfg: env } : { kind: "mock" };
  }
  if (!c) return { kind: "missing", reason: "Your session could not be matched to an agent computer. Reload the page and try again." };
  return c.hermes ? { kind: "hermes", cfg: c.hermes } : { kind: "missing", reason: c.missing ?? NOT_SET_UP };
}

/** The computer whose files the agent writes, for an owner. Null when unknown. */
export function computerFor(ownerId: string | undefined): ComputerConfig | null {
  if (!ownerId || ownerId === "local") return devUserEnabled() ? computerConfig() : null;
  const c = cache.get(ownerId);
  if (!c) return null;
  return c.computer ?? (c.dev && devUserEnabled() ? computerConfig() : null);
}

/**
 * The owner's Orgo client, for the relay's own work on their computers (connecting a task to the computer
 * it was given, making a task folder). Null when unknown. Dev users and the file store use the env key.
 */
export function orgoClientFor(ownerId: string | undefined): OrgoClient | null {
  const local = !ownerId || ownerId === "local";
  const c = local ? undefined : cache.get(ownerId);
  const creds = local ? (devUserEnabled() ? envOrgo() : null) : c ? (c.orgo ?? (c.dev && devUserEnabled() ? envOrgo() : null)) : null;
  if (!creds) return null;
  try {
    return new OrgoClient({ apiKey: creds.apiKey, workspaceId: creds.workspaceId });
  } catch {
    return null;
  }
}
