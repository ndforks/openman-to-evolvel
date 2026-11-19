/**
 * Compatibility layer over the user-scoped client (`user-client.ts`). New code should call
 * `orgoFor(session)` from `@/lib/session` and use the `OrgoClient` it returns.
 *
 * `orgoConfig()` still describes the env key (`ORGO_API_KEY` + `ORGO_WORKSPACE_ID`), which is the dev user's
 * credential and the server's fallback for background work that has no user. Never import this from a client component.
 */
import { OrgoClient, ORGO_API_BASE } from "./user-client";

export { OrgoError, type OrgoComputer, type OrgoCreateComputerBody as OrgoCreateBody } from "./user-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrgoConfig {
  apiKey: string;
  workspaceId: string;
  baseUrl: string;
}

/** The env Orgo settings, or null when the key or the workspace id is missing. */
export function orgoConfig(): OrgoConfig | null {
  const apiKey = process.env.ORGO_API_KEY?.trim();
  const workspaceId = process.env.ORGO_WORKSPACE_ID?.trim();
  if (!apiKey || !workspaceId || !UUID.test(workspaceId)) return null;
  return { apiKey, workspaceId, baseUrl: ORGO_API_BASE };
}

/** A client for the env key. Prefer `orgoFor(session)`. */
export function envClient(): OrgoClient | null {
  const cfg = orgoConfig();
  return cfg ? new OrgoClient({ apiKey: cfg.apiKey, workspaceId: cfg.workspaceId, baseUrl: cfg.baseUrl }) : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
