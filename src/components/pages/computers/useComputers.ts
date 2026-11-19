"use client";

/**
 * The real cloud computers, read from `/api/computers` and shared by everything that shows them:
 * the Computers page, Settings > Computers and the composer's "Run this task on" menu.
 * One store, one poller: status stays live while at least one of them is on screen.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { isTransitional, type CloudComputer, type ComputersResponse } from "@/lib/orgo/types";

export type ComputerAction = "restart" | "delete";

interface ComputersState {
  computers: CloudComputer[];
  /** False until the first answer (or failure) is in. */
  loaded: boolean;
  /** False when the server has no Orgo key; `notice` then says so. */
  configured: boolean;
  /** Why the list could not be read, or why it is empty by design. */
  notice: string | null;
  /** The action in flight per computer id. */
  busy: Record<string, ComputerAction>;
  refresh: () => Promise<void>;
  /** Put a computer into the list straight away (after a create), ahead of the next poll. */
  upsert: (computer: CloudComputer) => void;
  /** Both resolve to null on success, or to the reason it failed. */
  restart: (id: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
}

const ENDPOINT = "/api/computers";
const NOT_SENT = "The request could not be sent. Check your connection and try again.";

async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: unknown };
    if (typeof json.error === "string" && json.error.trim()) return json.error.trim();
  } catch {
    // Not JSON: use the fallback.
  }
  return `${fallback} (the server answered ${res.status}).`;
}

let inFlight: Promise<void> | null = null;

export const useComputersStore = create<ComputersState>((set, get) => ({
  computers: [],
  loaded: false,
  configured: true,
  notice: null,
  busy: {},

  refresh: () => {
    // Several components ask at once on mount; they share one request.
    inFlight ??= (async () => {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) {
          set({ loaded: true, notice: await readError(res, "The computers could not be loaded") });
          return;
        }
        const data = (await res.json()) as ComputersResponse;
        const computers = Array.isArray(data.computers) ? data.computers : [];
        set({ computers, loaded: true, configured: data.configured !== false, notice: data.configured === false ? (data.reason ?? null) : null });
      } catch {
        set({ loaded: true, notice: NOT_SENT });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  upsert: (computer) =>
    set((state) => ({
      loaded: true,
      computers: state.computers.some((c) => c.id === computer.id) ? state.computers.map((c) => (c.id === computer.id ? computer : c)) : [...state.computers, computer],
    })),

  restart: async (id) => {
    if (get().busy[id]) return null;
    set((state) => ({ busy: { ...state.busy, [id]: "restart" } }));
    let failure: string | null = null;
    try {
      const res = await fetch(`${ENDPOINT}/${id}/restart`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { computer?: CloudComputer } | null;
        if (data?.computer) get().upsert(data.computer);
      } else {
        failure = await readError(res, "The computer could not be restarted");
      }
    } catch {
      failure = NOT_SENT;
    }
    set((state) => {
      const { [id]: _done, ...busy } = state.busy;
      void _done;
      return { busy };
    });
    void get().refresh();
    return failure;
  },

  remove: async (id) => {
    if (get().busy[id]) return null;
    set((state) => ({ busy: { ...state.busy, [id]: "delete" } }));
    let failure: string | null = null;
    try {
      const res = await fetch(`${ENDPOINT}/${id}`, { method: "DELETE" });
      if (res.ok) set((state) => ({ computers: state.computers.filter((c) => c.id !== id) }));
      else failure = await readError(res, "The computer could not be deleted");
    } catch {
      failure = NOT_SENT;
    }
    set((state) => {
      const { [id]: _done, ...busy } = state.busy;
      void _done;
      return { busy };
    });
    void get().refresh();
    return failure;
  },
}));

/* ---------- one poller for every mounted consumer ---------- */

const SETTLED_MS = 8000;
const CHANGING_MS = 2500;

let watchers = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  if (timer) clearTimeout(timer);
  if (watchers === 0) {
    timer = null;
    return;
  }
  const { computers, busy } = useComputersStore.getState();
  const changing = Object.keys(busy).length > 0 || computers.some((c) => isTransitional(c.status));
  timer = setTimeout(async () => {
    if (document.visibilityState === "visible") await useComputersStore.getState().refresh();
    schedule();
  }, changing ? CHANGING_MS : SETTLED_MS);
}

/**
 * The computers, kept fresh. `live` (the default) re-reads the list every few seconds while the component is
 * mounted, faster while something is starting or restarting. Pass `live: false` to read once and on demand.
 */
export function useComputers({ live = true }: { live?: boolean } = {}): ComputersState {
  const state = useComputersStore();

  useEffect(() => {
    void useComputersStore.getState().refresh().then(() => {
      if (live) schedule();
    });
    if (!live) return;
    watchers += 1;
    const onVisible = () => {
      if (document.visibilityState === "visible") void useComputersStore.getState().refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      watchers -= 1;
      document.removeEventListener("visibilitychange", onVisible);
      schedule();
    };
  }, [live]);

  return state;
}

/** "Linux", "Windows", "macOS", or Orgo's own word for anything else. */
export function osLabel(os: string): string {
  return ({ linux: "Linux", windows: "Windows", macos: "macOS", android: "Android", ios: "iOS" } as Record<string, string>)[os] ?? os;
}

/** "Linux · Standard · 4 GB RAM · 2 vCPU · 70 GB · London" */
export function describeComputer(computer: CloudComputer): string {
  // A custom size arrives as "4 GB, 2 vCPU": the specs below already say that, so it is not printed twice.
  const size = computer.plan ?? computer.size;
  const parts = [osLabel(computer.os), ...(size && !/\b(GB|vCPU)\b/i.test(size) ? [size] : []), `${computer.specs.memoryGb} GB RAM`, `${computer.specs.vcpu} vCPU`];
  if (computer.specs.storageGb) parts.push(`${computer.specs.storageGb} GB`);
  parts.push(computer.location);
  return parts.join(" · ");
}
