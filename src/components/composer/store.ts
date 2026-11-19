"use client";

/** What the composer remembers between visits: agent mode, effort, speed, where the task runs and which connectors are on. */
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { brand, type ModeId } from "@/config/brand";
import type { Effort, RunTarget, Speed } from "@/lib/agent/types";

export const EFFORTS: readonly { id: Effort; label: string }[] = [
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "extra", label: "Extra" },
  { id: "ultra", label: "Ultra" },
];
export const SPEEDS: readonly { id: Speed; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];

export interface ComposerPrefs {
  mode: ModeId;
  effort: Effort;
  speed: Speed;
  target: RunTarget;
  /** Ids of connectors switched on for new tasks. */
  connectors: string[];
  /** Project new tasks are filed under; null when none is chosen. */
  projectId: string | null;
}

export interface ComposerState extends ComposerPrefs {
  setMode: (mode: ModeId) => void;
  setEffort: (effort: Effort) => void;
  setSpeed: (speed: Speed) => void;
  setTarget: (target: RunTarget) => void;
  toggleConnector: (id: string, on?: boolean) => void;
  setProjectId: (projectId: string | null) => void;
}

export const DEFAULT_PREFS: ComposerPrefs = {
  mode: "lite",
  effort: "high",
  speed: "normal",
  target: { kind: "cloud-temporary" },
  connectors: [],
  projectId: null,
};

function isTarget(value: unknown): value is RunTarget {
  if (typeof value !== "object" || value === null) return false;
  const target = value as { kind?: unknown; computerId?: unknown };
  if (target.kind === "cloud-temporary" || target.kind === "local") return true;
  return target.kind === "cloud-persistent" && typeof target.computerId === "string" && target.computerId.length > 0;
}

/** Keep only values this build understands, so stale or hand-edited storage cannot break the UI. */
function sanitize(raw: unknown): ComposerPrefs {
  const stored = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof ComposerPrefs, unknown>>;
  return {
    mode: typeof stored.mode === "string" && stored.mode in brand.modes ? (stored.mode as ModeId) : DEFAULT_PREFS.mode,
    effort: EFFORTS.find((e) => e.id === stored.effort)?.id ?? DEFAULT_PREFS.effort,
    speed: SPEEDS.find((s) => s.id === stored.speed)?.id ?? DEFAULT_PREFS.speed,
    target: isTarget(stored.target) ? stored.target : DEFAULT_PREFS.target,
    connectors: Array.isArray(stored.connectors) ? stored.connectors.filter((c): c is string => typeof c === "string") : DEFAULT_PREFS.connectors,
    projectId: typeof stored.projectId === "string" && stored.projectId !== "" ? stored.projectId : DEFAULT_PREFS.projectId,
  };
}

export const useComposerStore = create<ComposerState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setMode: (mode) => set({ mode }),
      setEffort: (effort) => set({ effort }),
      setSpeed: (speed) => set({ speed }),
      setTarget: (target) => set({ target }),
      toggleConnector: (id, on) =>
        set((state) => {
          const enabled = on ?? !state.connectors.includes(id);
          const rest = state.connectors.filter((c) => c !== id);
          return { connectors: enabled ? [...rest, id] : rest };
        }),
      setProjectId: (projectId) => set({ projectId }),
    }),
    {
      name: "composer-prefs",
      version: 1,
      // `window.localStorage` (not the bare global) so the server, which has no window, simply gets no storage.
      storage: createJSONStorage(() => window.localStorage),
      // The server renders the defaults; the stored values are applied after mount (see `useComposerHydration`).
      skipHydration: true,
      partialize: ({ mode, effort, speed, target, connectors, projectId }): ComposerPrefs => ({ mode, effort, speed, target, connectors, projectId }),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);

/** Load the stored preferences once the component is in the browser. Safe to call from several components. */
export function useComposerHydration(): void {
  useEffect(() => {
    // `persist` is missing when the browser blocks storage; the defaults stay in place then.
    const persisted = useComposerStore.persist as typeof useComposerStore.persist | undefined;
    if (persisted && !persisted.hasHydrated()) void persisted.rehydrate();
  }, []);
}

/** Short label for the run-target chip. */
export function targetLabel(target: RunTarget): string {
  return target.kind === "local" ? "Local" : "Cloud";
}
