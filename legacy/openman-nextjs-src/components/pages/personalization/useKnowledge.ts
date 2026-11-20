// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Knowledge entries from `/api/knowledge`, one shared copy per page. */
import { useSyncExternalStore } from "react";

export interface KnowledgeEntry {
  id: string;
  name: string;
  whenToUse: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeDraft = Pick<KnowledgeEntry, "name" | "whenToUse" | "content">;

interface State {
  entries: KnowledgeEntry[];
  limit: number;
  loaded: boolean;
  error: string | null;
}

let state: State = { entries: [], limit: 50, loaded: false, error: null };
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export async function reloadKnowledge(): Promise<void> {
  try {
    const body = await call<{ knowledge: KnowledgeEntry[]; limit: number }>("/api/knowledge");
    set({ entries: body.knowledge, limit: body.limit, loaded: true, error: null });
  } catch (err) {
    set({ loaded: true, error: err instanceof Error ? err.message : "Could not load knowledge." });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void reloadKnowledge();
  }
  return () => {
    listeners.delete(listener);
  };
}

export async function addKnowledge(draft: KnowledgeDraft): Promise<KnowledgeEntry> {
  const { entry } = await call<{ entry: KnowledgeEntry }>("/api/knowledge", { method: "POST", body: JSON.stringify(draft) });
  set({ entries: [...state.entries, entry] });
  return entry;
}

export async function editKnowledge(id: string, patch: Partial<KnowledgeDraft & { enabled: boolean }>): Promise<void> {
  const before = state.entries;
  set({ entries: before.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  try {
    const { entry } = await call<{ entry: KnowledgeEntry }>(`/api/knowledge/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    set({ entries: state.entries.map((e) => (e.id === id ? entry : e)) });
  } catch (err) {
    set({ entries: before });
    throw err;
  }
}

export async function removeKnowledge(id: string): Promise<void> {
  const before = state.entries;
  set({ entries: before.filter((e) => e.id !== id) });
  try {
    await call(`/api/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (err) {
    set({ entries: before });
    throw err;
  }
}

export function useKnowledge(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
