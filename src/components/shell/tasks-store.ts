"use client";

/**
 * The task list shown in the sidebar (and reused by the composer's "Recent tasks", search and project pages),
 * plus every change a task menu can make: rename, favourite, archive, move to a project, delete.
 * Changes show at once and are taken back when the server refuses them.
 * Pin and "Mark as unread" are server fields too (`pinned`, `unread`), so they follow the user across browsers.
 */
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { readPref, writePref } from "@/components/settings/prefs";
import { listTasks } from "@/lib/agent/client";
import type { TaskSummary } from "@/lib/agent/types";

export type SidebarTask = TaskSummary & { archived?: boolean };

interface TasksState {
  tasks: SidebarTask[];
  /** "idle" until the first request finishes; "error" when the last request failed. */
  status: "idle" | "ready" | "error";
  refresh: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;
const byRecent = (list: SidebarTask[]) => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  status: "idle",
  refresh: () => {
    inFlight ??= listTasks()
      .then(({ tasks }) => set({ tasks: byRecent(tasks), status: "ready" }))
      .catch(() => {
        // Keep whatever we already had; an empty list renders as "No tasks yet".
        set({ status: "error" });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },
}));

/** Reload the task list from anywhere (after creating, renaming or deleting a task). */
export function refreshTasks(): Promise<void> {
  return useTasksStore.getState().refresh();
}

const POLL_MS = 15_000;

/** Keep the list fresh while mounted: on mount, when `key` changes, when the tab regains focus and on a slow poll. */
export function useTasksSync(key: string): void {
  useEffect(() => {
    void refreshTasks();
  }, [key]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refreshTasks();
    };
    const timer = window.setInterval(refreshIfVisible, POLL_MS);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, []);
}

/* ---------------------------------------------------------------- changes */

/** Listeners outside the store (the open task view) that want to hear about a change made from a menu. */
type PatchListener = (id: string, patch: Partial<SidebarTask>) => void;
const patchListeners = new Set<PatchListener>();
export function onTaskPatched(listener: PatchListener): () => void {
  patchListeners.add(listener);
  return () => {
    patchListeners.delete(listener);
  };
}

function setLocal(id: string, patch: Partial<SidebarTask>) {
  useTasksStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)).filter((t) => !t.archived) }));
  patchListeners.forEach((l) => l(id, patch));
}

async function fail(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") message = body.error;
  } catch {
    // Not JSON.
  }
  throw new Error(message);
}

export type TaskPatch = { title?: string; favorite?: boolean; archived?: boolean; projectId?: string | null; pinned?: boolean; unread?: boolean };

/** PATCH /api/tasks/[id], shown at once. Resolves with the server's copy; on failure restores the old values and throws. */
export async function patchTask(id: string, patch: TaskPatch): Promise<Partial<SidebarTask>> {
  const before = useTasksStore.getState().tasks.find((t) => t.id === id);
  const keys = [...Object.keys(patch), ...(patch.pinned !== undefined ? ["pinnedAt"] : [])];
  const undo: Partial<SidebarTask> = before ? Object.fromEntries(keys.map((k) => [k, before[k as keyof SidebarTask]])) : {};
  setLocal(id, patch.pinned === undefined ? patch : { ...patch, pinnedAt: patch.pinned ? (before?.pinnedAt ?? new Date().toISOString()) : null });
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) await fail(res, "The task could not be updated.");
    const { task } = (await res.json()) as { task: SidebarTask };
    const confirmed: Partial<SidebarTask> = {
      title: task.title,
      favorite: task.favorite,
      projectId: task.projectId ?? null,
      archived: task.archived,
      pinned: task.pinned,
      pinnedAt: task.pinnedAt ?? null,
      unread: task.unread,
      section: task.section,
    };
    // An unarchived task comes back into the list.
    if (patch.archived === false) void refreshTasks();
    else setLocal(id, confirmed);
    return confirmed;
  } catch (err) {
    if (before) {
      useTasksStore.setState((s) => ({ tasks: byRecent(s.tasks.some((t) => t.id === id) ? s.tasks.map((t) => (t.id === id ? { ...t, ...undo } : t)) : [...s.tasks, { ...before }]) }));
      patchListeners.forEach((l) => l(id, undo));
    }
    throw err;
  }
}

/** DELETE /api/tasks/[id]: it leaves the list at once and comes back if the server refuses. */
export async function removeTask(id: string): Promise<void> {
  const before = useTasksStore.getState().tasks;
  useTasksStore.setState({ tasks: before.filter((t) => t.id !== id) });
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  if (!res || !res.ok) {
    useTasksStore.setState({ tasks: before });
    if (res) await fail(res, "The task could not be deleted.");
    throw new Error("The task could not be deleted.");
  }
}

/* ---------------------------------------------------------------- pin and unread (server fields) */

const report = (err: unknown) => console.warn("[tasks]", err instanceof Error ? err.message : err);
export const setPinned = (id: string, on: boolean) => void patchTask(id, { pinned: on }).catch(report);
export const setUnread = (id: string, on: boolean) => {
  const task = useTasksStore.getState().tasks.find((t) => t.id === id);
  if (task && Boolean(task.unread) === on) return;
  void patchTask(id, { unread: on }).catch(report);
};

/** Pinned task ids, most recently pinned first. */
export function usePinnedTasks(): string[] {
  const tasks = useTasksStore((s) => s.tasks);
  const key = tasks
    .filter((t) => t.pinned || t.pinnedAt)
    .sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""))
    .map((t) => t.id)
    .join(",");
  return useMemo(() => (key ? key.split(",") : []), [key]);
}
export function useUnreadTasks(): string[] {
  const tasks = useTasksStore((s) => s.tasks);
  const key = tasks
    .filter((t) => t.unread)
    .map((t) => t.id)
    .join(",");
  return useMemo(() => (key ? key.split(",") : []), [key]);
}

/* Pins and unread marks saved in this browser before they were server fields move to the server once. */
const LEGACY_KEYS = [
  ["sidebar.pinnedTasks", "pinned"],
  ["sidebar.unreadTasks", "unread"],
] as const;
let legacyMoved = false;
export function useMoveLegacySidebarPrefs(): void {
  const status = useTasksStore((s) => s.status);
  useEffect(() => {
    if (status !== "ready" || legacyMoved) return;
    legacyMoved = true;
    const known = new Set(useTasksStore.getState().tasks.map((t) => t.id));
    for (const [key, field] of LEGACY_KEYS) {
      const list = readPref<string[] | null>(key, null);
      if (!Array.isArray(list) || list.length === 0) continue;
      for (const id of [...list].reverse()) if (known.has(id)) void patchTask(id, { [field]: true }).catch(report);
      writePref(key, []);
    }
  }, [status]);
}
