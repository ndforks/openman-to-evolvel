// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Preference store. `usePref("general.language", "en")` works like useState.
 *
 * Every value is cached in localStorage for an instant first paint. Keys under `SYNCED_PREFIXES` also
 * follow the user across devices: they are loaded from `GET /api/settings` (`settings.prefs`) once per page
 * and written back with `PATCH /api/settings`. Other keys (sidebar width, panel state...) stay on this device.
 */
import { useCallback, useSyncExternalStore } from "react";
import { applyTheme, type ThemeChoice } from "@/components/modals/theme";

export const PREF_PREFIX = "openman:pref:";

/** Preferences that belong to the user, not to the device. */
export const SYNCED_PREFIXES = ["general.", "chat.", "notify.", "shortcuts."] as const;
export const isSyncedPref = (key: string) => SYNCED_PREFIXES.some((p) => key.startsWith(p));

const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  startSync();
  return () => {
    listeners.delete(fn);
  };
}

function storeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREF_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the value still lives in memory for this session.
  }
}

/* ---------- server sync ---------- */

let syncStarted = false;
let serverLoaded = false;
const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  flushTimer = null;
  if (!serverLoaded || pending.size === 0) return;
  const prefs = Object.fromEntries(pending);
  pending.clear();
  void fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ prefs }),
    keepalive: true,
  }).catch(() => {
    // Offline: put the values back so the next change retries them.
    for (const [k, v] of Object.entries(prefs)) if (!pending.has(k)) pending.set(k, v);
  });
}

function queue(key: string, value: unknown): void {
  pending.set(key, value);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 400);
}

function localSyncedKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREF_PREFIX) && isSyncedPref(k.slice(PREF_PREFIX.length))) keys.push(k.slice(PREF_PREFIX.length));
    }
  } catch {
    // No storage.
  }
  return keys;
}

/** Loads the user's preferences once per page. Server values win; values only this device has are uploaded. */
function startSync(): void {
  if (syncStarted || typeof window === "undefined") return;
  syncStarted = true;
  void (async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return; // Signed out: keep local values, nothing to sync to.
      const body = (await res.json()) as { settings?: { prefs?: Record<string, unknown> } };
      const remote = body.settings?.prefs && typeof body.settings.prefs === "object" ? body.settings.prefs : {};
      for (const [k, v] of Object.entries(remote)) {
        if (!isSyncedPref(k) || pending.has(k)) continue;
        cache.set(k, v);
        storeLocal(k, v);
      }
      serverLoaded = true;
      for (const k of localSyncedKeys()) if (!(k in remote) && !pending.has(k)) pending.set(k, readPref(k, null));
      flush();
      applyStoredTheme();
      emit();
    } catch {
      // Offline: local values stay in effect.
    }
  })();
}

/* ---------- theme ---------- */

let mediaWatch = false;
/** Applies `general.theme` (light, dark, or follow the system) to the app. */
export function applyStoredTheme(): void {
  // Only the signed-in app follows the setting; the marketing pages keep their own look.
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/app")) return;
  const theme = readPref<ThemeChoice>("general.theme", "dark");
  applyTheme(theme);
  if (!mediaWatch && typeof window.matchMedia === "function") {
    mediaWatch = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (readPref<ThemeChoice>("general.theme", "dark") === "auto") applyTheme("auto");
    });
  }
}

/* ---------- API ---------- */

/** Read a preference outside React. Returns `fallback` when nothing is stored or storage is unavailable. */
export function readPref<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value = fallback;
  try {
    const raw = window.localStorage.getItem(PREF_PREFIX + key);
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch {
    // Private mode or malformed JSON: keep the fallback.
  }
  cache.set(key, value);
  return value;
}

export function writePref<T>(key: string, value: T): void {
  cache.set(key, value);
  storeLocal(key, value);
  if (isSyncedPref(key)) queue(key, value);
  emit();
}

/** Remove every stored preference on this device (used by "Delete account"). */
export function clearPrefs(): void {
  cache.clear();
  pending.clear();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREF_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Nothing to clear.
  }
  emit();
}

export type SetPref<T> = (next: T | ((prev: T) => T)) => void;

export function usePref<T>(key: string, fallback: T): [T, SetPref<T>] {
  const value = useSyncExternalStore(
    subscribe,
    () => readPref(key, fallback),
    () => fallback,
  );
  const set = useCallback<SetPref<T>>(
    (next) => {
      const prev = readPref(key, fallback);
      writePref(key, typeof next === "function" ? (next as (p: T) => T)(prev) : next);
    },
    // The fallback only matters before the first read, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set];
}
