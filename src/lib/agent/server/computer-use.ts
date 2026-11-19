// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Computer Use permissions: per user, per desktop app, "always" (allow without asking) or "never"
 * (refuse without asking). Apps with no entry are asked about the first time the agent uses them in a task,
 * with Allow (this task), Always allow and Never. Stored in the user's settings document under
 * `computerUse.apps`, so the Computer Use settings screen reads and edits the same entries.
 */
import { getSettings, patchSettings, type SettingsDoc } from "@/lib/db/settings";

export type AppPermission = "always" | "never";

export interface AppPermissionEntry {
  name: string;
  permission: AppPermission;
  updatedAt: string;
}

/** The settings key Computer Use permissions live under. */
export const COMPUTER_USE_KEY = "computerUse";

/** Stable key for an app name: "Google Chrome" and "google chrome" are one app. */
export function appKey(name: string): string {
  return name.trim().toLowerCase().replace(/\.app$/, "").replace(/\s+/g, " ").slice(0, 80);
}

const g = globalThis as typeof globalThis & { __omAppPerms?: Map<string, { at: number; apps: Record<string, AppPermissionEntry> }> };
const cache = (g.__omAppPerms ??= new Map());
const TTL_MS = 5000;

export function readEntries(doc: SettingsDoc): Record<string, AppPermissionEntry> {
  const section = doc[COMPUTER_USE_KEY];
  const apps = section && typeof section === "object" ? (section as { apps?: unknown }).apps : undefined;
  if (!apps || typeof apps !== "object") return {};
  const out: Record<string, AppPermissionEntry> = {};
  for (const [key, value] of Object.entries(apps as Record<string, unknown>)) {
    const entry = value as Partial<AppPermissionEntry> | null;
    if (entry && (entry.permission === "always" || entry.permission === "never")) {
      out[key] = { name: typeof entry.name === "string" ? entry.name : key, permission: entry.permission, updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "" };
    }
  }
  return out;
}

async function entries(ownerId: string): Promise<Record<string, AppPermissionEntry>> {
  const known = cache.get(ownerId);
  if (known && Date.now() - known.at < TTL_MS) return known.apps;
  const apps = ownerId === "local" ? (known?.apps ?? {}) : readEntries(await getSettings(ownerId));
  cache.set(ownerId, { at: Date.now(), apps });
  return apps;
}

/** The stored permission for an app, or undefined when the user hasn't decided. */
export async function appPermission(ownerId: string, app: string): Promise<AppPermission | undefined> {
  try {
    return (await entries(ownerId))[appKey(app)]?.permission;
  } catch (err) {
    console.warn("[computer-use] could not read permissions:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** Saves "always" or "never" for an app. */
export async function setAppPermission(ownerId: string, app: string, permission: AppPermission): Promise<void> {
  const key = appKey(app);
  const entry: AppPermissionEntry = { name: app.trim().slice(0, 80), permission, updatedAt: new Date().toISOString() };
  const known = cache.get(ownerId)?.apps ?? {};
  cache.set(ownerId, { at: Date.now(), apps: { ...known, [key]: entry } });
  if (ownerId === "local") return;
  await patchSettings(ownerId, { [COMPUTER_USE_KEY]: { apps: { [key]: entry } } });
}

/** Forget the cached copy (the settings screen changed the entries). */
export function forgetAppPermissions(ownerId: string): void {
  cache.delete(ownerId);
}
