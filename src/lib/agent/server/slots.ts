/**
 * Run slots: at most N runs of one user's tasks at once (N from `src/lib/limits/concurrency.ts`, by the size of the
 * user's home computer). A run that finds no free slot waits in a first-come, first-served queue and starts by
 * itself when one frees up. Kept in server memory (one server process); a queued task also keeps its first prompt
 * in its meta, so a restart puts it back in the queue.
 */
import { concurrentTasksFor, SIZE_CACHE_MS } from "@/lib/limits/concurrency";
import { computerFor, orgoClientFor } from "./connection";

interface Waiter {
  taskId: string;
  grant: (granted: boolean) => void;
  onMove?: (ahead: number) => void;
}

interface OwnerSlots {
  running: Set<string>;
  waiting: Waiter[];
}

const g = globalThis as typeof globalThis & { __omSlots?: Map<string, OwnerSlots>; __omSlotSizes?: Map<string, { at: number; limit: number }> };
const owners = (g.__omSlots ??= new Map());
const sizes = (g.__omSlotSizes ??= new Map());

const slotsOf = (ownerId: string): OwnerSlots => {
  let s = owners.get(ownerId);
  if (!s) owners.set(ownerId, (s = { running: new Set(), waiting: [] }));
  return s;
};

/** The owner's limit: from their home computer's vCPUs (cached for ten minutes), or the default. */
export async function limitFor(ownerId: string): Promise<number> {
  const known = sizes.get(ownerId);
  if (known && Date.now() - known.at < SIZE_CACHE_MS) return known.limit;
  let vcpus: number | undefined;
  try {
    const orgo = orgoClientFor(ownerId);
    const home = computerFor(ownerId)?.computerId;
    if (orgo && home) vcpus = (await orgo.listComputers()).find((c) => c.id.toLowerCase() === home.toLowerCase())?.cpu;
  } catch {
    // Unknown size: the default applies.
  }
  const limit = concurrentTasksFor(vcpus);
  sizes.set(ownerId, { at: Date.now(), limit });
  return limit;
}

/** Synchronous view of the limit, for listings: the cached one, else the default for an unknown size. */
export function cachedLimit(ownerId: string): number {
  return sizes.get(ownerId)?.limit ?? concurrentTasksFor(undefined);
}

function pump(ownerId: string, limit: number): void {
  const s = slotsOf(ownerId);
  while (s.running.size < limit && s.waiting.length) {
    const next = s.waiting.shift()!;
    s.running.add(next.taskId);
    next.grant(true);
  }
  s.waiting.forEach((w, i) => w.onMove?.(i));
}

/**
 * Waits for a slot for one run of `taskId`. Resolves true once the run may start, false when it was cancelled while
 * waiting. `onQueued(ahead)` is called when it has to wait, and again each time the queue moves.
 */
export async function acquireSlot(ownerId: string, taskId: string, onQueued?: (ahead: number) => void): Promise<boolean> {
  const limit = await limitFor(ownerId);
  const s = slotsOf(ownerId);
  if (s.running.has(taskId)) return true;
  if (s.running.size < limit && s.waiting.length === 0) {
    s.running.add(taskId);
    return true;
  }
  return new Promise<boolean>((resolve) => {
    s.waiting.push({ taskId, grant: resolve, onMove: onQueued });
    onQueued?.(s.waiting.length - 1);
  });
}

/** Counts a run that is already going (re-attached after a restart) without waiting. */
export function claimSlot(ownerId: string, taskId: string): void {
  slotsOf(ownerId).running.add(taskId);
}

/** Frees the task's slot and starts the next waiting run. */
export function releaseSlot(ownerId: string, taskId: string): void {
  const s = slotsOf(ownerId);
  if (!s.running.delete(taskId)) return;
  pump(ownerId, sizes.get(ownerId)?.limit ?? concurrentTasksFor(undefined));
}

/** Takes a waiting run out of the queue (it was stopped). True when it was waiting. */
export function cancelWait(ownerId: string, taskId: string): boolean {
  const s = slotsOf(ownerId);
  const i = s.waiting.findIndex((w) => w.taskId === taskId);
  if (i < 0) return false;
  const [w] = s.waiting.splice(i, 1);
  w.grant(false);
  s.waiting.forEach((x, j) => x.onMove?.(j));
  return true;
}

/** Where a task stands: running, waiting with `ahead` runs before it, or neither. */
export function slotState(ownerId: string, taskId: string): { running: number; waiting: number; limit: number; ahead: number | null } {
  const s = slotsOf(ownerId);
  const i = s.waiting.findIndex((w) => w.taskId === taskId);
  return { running: s.running.size, waiting: s.waiting.length, limit: cachedLimit(ownerId), ahead: i < 0 ? null : i };
}
