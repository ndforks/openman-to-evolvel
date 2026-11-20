// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Browser helpers for generators: availability, starting a generator task, and polling a task's generator state. */
import { useEffect, useRef, useState } from "react";
import type { CreateTaskInput, TaskSummary } from "@/lib/agent/types";
import type { AvailabilityResponse, DeckBundle, ExportFormat, GeneratorAvailability, GeneratorKind, GeneratorState, GeneratorVariant } from "./types";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

/* ------------------------------------------------------------ availability */

const STORAGE_KEY = "openman:generators";
/** Until the computer has answered: what needs only the agent. Media generators wait for the real answer. */
const DEFAULT: GeneratorAvailability[] = [
  { kind: "slides", available: true },
  { kind: "research", available: true },
  { kind: "data", available: true },
];

let memo: GeneratorAvailability[] | null = null;
let pending: Promise<GeneratorAvailability[]> | null = null;

function readStored(): GeneratorAvailability[] | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GeneratorAvailability[]) : null;
  } catch {
    return null;
  }
}

export function fetchAvailability(refresh = false): Promise<GeneratorAvailability[]> {
  if (!refresh && pending) return pending;
  pending = fetch(`/api/generators${refresh ? "?refresh=1" : ""}`, { headers: { accept: "application/json" } })
    .then((r) => json<AvailabilityResponse>(r))
    .then((body) => {
      memo = body.generators;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memo));
      } catch {
        // Storage blocked: the answer is kept in memory only.
      }
      return memo;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The generators this user can use. Starts from the last answer (or the agent-only default) and refreshes once per page load. */
export function useGeneratorAvailability(): GeneratorAvailability[] {
  const [list, setList] = useState<GeneratorAvailability[]>(() => memo ?? DEFAULT);
  useEffect(() => {
    const stored = memo ?? readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the stored answer only exists in the browser
    if (stored) setList(stored);
    let cancelled = false;
    fetchAvailability()
      .then((next) => {
        if (!cancelled) setList(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return list;
}

export const isAvailable = (list: GeneratorAvailability[], kind: GeneratorKind) => list.some((g) => g.kind === kind && g.available);

/* ------------------------------------------------------------------- start */

export interface StartGeneratorInput extends CreateTaskInput {
  kind: GeneratorKind;
  variant?: GeneratorVariant;
  theme?: string;
}

export function startGenerator(input: StartGeneratorInput): Promise<{ task: TaskSummary }> {
  return fetch("/api/generators/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }).then((r) => json<{ task: TaskSummary }>(r));
}

/* ------------------------------------------------------------------- state */

export const generatorFileUrl = (taskId: string, path: string, download = false) =>
  `/api/generators/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;

export function fetchGeneratorState(taskId: string): Promise<GeneratorState> {
  return fetch(`/api/generators/${encodeURIComponent(taskId)}`, { headers: { accept: "application/json" } }).then((r) => json<GeneratorState>(r));
}

export function fetchDeck(taskId: string, version: number): Promise<DeckBundle> {
  return fetch(`/api/generators/${encodeURIComponent(taskId)}/deck?v=${version}`, { headers: { accept: "application/json" } }).then((r) => json<DeckBundle>(r));
}

export function exportDeck(taskId: string, format: ExportFormat): Promise<{ path: string; url: string }> {
  return fetch(`/api/generators/${encodeURIComponent(taskId)}/export`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format }) }).then((r) =>
    json<{ path: string; url: string }>(r),
  );
}

/**
 * A task's generator state, polled while `live` (the task is running) and once more when it stops.
 * `null` until the first answer; `{ kind: null }` for an ordinary task (then polling stops).
 */
export function useGeneratorState(taskId: string | null, live: boolean, intervalMs = 4000): { state: GeneratorState | null; refresh: () => void } {
  const [state, setState] = useState<GeneratorState | null>(null);
  const [tick, setTick] = useState(0);
  const kindRef = useRef<GeneratorState["kind"] | undefined>(undefined);
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const next = await fetchGeneratorState(taskId);
        if (cancelled) return;
        kindRef.current = next.kind;
        setState(next);
      } catch {
        // Keep the last answer; try again on the next tick.
      }
      if (!cancelled && live && kindRef.current !== null) timer = setTimeout(load, intervalMs);
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId, live, intervalMs, tick]);
  return { state, refresh: () => setTick((t) => t + 1) };
}
