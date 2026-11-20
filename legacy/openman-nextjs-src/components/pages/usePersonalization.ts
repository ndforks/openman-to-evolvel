// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The personalization profile and the "Use knowledge" switch, one shared copy per page, backed by
 * `GET/PATCH /api/personalization` (stored in the user's settings, delivered to every agent run and
 * mirrored into Hermes' USER.md on the user's computer).
 */
import { useCallback, useSyncExternalStore } from "react";

export interface Personalization {
  nickname: string;
  occupation: string;
  /** "More about you". */
  about: string;
  /** "Custom Instructions". */
  instructions: string;
}

export const EMPTY_PERSONALIZATION: Personalization = { nickname: "", occupation: "", about: "", instructions: "" };

/** Longest value accepted per field (the server enforces the same limits). */
export const PERSONALIZATION_LIMITS: Record<keyof Personalization, number> = { nickname: 50, occupation: 100, about: 2000, instructions: 3000 };

const FIELDS = Object.keys(EMPTY_PERSONALIZATION) as (keyof Personalization)[];

export interface MirrorStatus {
  state: "pending" | "synced" | "failed";
  at: string;
  detail?: string;
}

interface State {
  saved: Personalization;
  useKnowledge: boolean;
  loaded: boolean;
  /** "saving" while a change is on its way, "error" when the last save failed. */
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
  mirror: MirrorStatus | null;
}

let state: State = { saved: EMPTY_PERSONALIZATION, useKnowledge: true, loaded: false, status: "idle", error: null, mirror: null };
const listeners = new Set<() => void>();
let started = false;
let pending: Partial<Personalization> & { useKnowledge?: boolean } = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function fromServer(p: Record<string, unknown> | undefined): Pick<State, "saved" | "useKnowledge"> {
  const saved = { ...EMPTY_PERSONALIZATION };
  for (const f of FIELDS) if (typeof p?.[f] === "string") saved[f] = p[f] as string;
  return { saved, useKnowledge: typeof p?.useKnowledge === "boolean" ? p.useKnowledge : true };
}

export async function reloadPersonalization(): Promise<void> {
  try {
    const res = await fetch("/api/personalization", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return set({ loaded: true });
    const body = (await res.json()) as { personalization?: Record<string, unknown>; mirror?: MirrorStatus | null };
    // Keep what the user is typing if a save is still queued.
    const server = fromServer(body.personalization);
    set({ ...server, saved: { ...server.saved, ...pending }, loaded: true, mirror: body.mirror ?? null });
  } catch {
    set({ loaded: true });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void reloadPersonalization();
  }
  return () => {
    listeners.delete(listener);
  };
}

async function flush() {
  timer = null;
  const body = pending;
  pending = {};
  if (Object.keys(body).length === 0) return;
  set({ status: "saving", error: null });
  try {
    const res = await fetch("/api/personalization", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { personalization?: Record<string, unknown>; mirror?: MirrorStatus | null; error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    const server = fromServer(json.personalization);
    set({ ...server, saved: { ...server.saved, ...pending }, status: Object.keys(pending).length ? "saving" : "saved", mirror: json.mirror ?? state.mirror });
    // The USER.md mirror runs a few seconds later; check back once for its outcome.
    if (json.mirror?.state === "pending") setTimeout(() => void reloadPersonalization(), 6000);
  } catch (err) {
    set({ status: "error", error: err instanceof Error ? err.message : "Could not save." });
  }
}

function queue(patch: Partial<Personalization> & { useKnowledge?: boolean }, delay: number) {
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

export function samePersonalization(a: Personalization, b: Personalization): boolean {
  return FIELDS.every((field) => a[field] === b[field]);
}

export interface PersonalizationStore extends State {
  /** Store a whole profile now; values are trimmed. Used by forms with an explicit Save. */
  save: (next: Personalization) => void;
  /** Store some fields as typed, saved after a short pause. Used by fields that save as you type. */
  update: (patch: Partial<Personalization>) => void;
  setUseKnowledge: (on: boolean) => void;
}

export function usePersonalization(): PersonalizationStore {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  const save = useCallback((next: Personalization) => {
    const clean: Personalization = { ...EMPTY_PERSONALIZATION };
    for (const f of FIELDS) clean[f] = next[f].trim().slice(0, PERSONALIZATION_LIMITS[f]);
    set({ saved: clean });
    queue(clean, 0);
  }, []);
  const update = useCallback((patch: Partial<Personalization>) => {
    const next: Partial<Personalization> = {};
    for (const f of FIELDS) if (typeof patch[f] === "string") next[f] = patch[f]!.slice(0, PERSONALIZATION_LIMITS[f]);
    set({ saved: { ...state.saved, ...next }, status: "saving" });
    queue(next, 700);
  }, []);
  const setUseKnowledge = useCallback((on: boolean) => {
    set({ useKnowledge: on });
    queue({ useKnowledge: on }, 0);
  }, []);
  return { ...snapshot, save, update, setUseKnowledge };
}
