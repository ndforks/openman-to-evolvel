// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * How many tasks one user may run at once. Every run of a user's tasks happens on that user's home computer (one
 * Hermes gateway), so the limit follows the computer's size, not a plan: each running task holds an agent, a shell
 * and often a browser. Extra tasks wait in a queue and start in order. Hermes' own cap
 * (`gateway.api_server.max_concurrent_runs`) is set to the same number at setup (`src/lib/provision`).
 *
 * Override for every user with `OM_MAX_CONCURRENT_TASKS` (1-20).
 */

/** Tasks at once by the home computer's vCPU count (Orgo sizes: Medium 2, Large 4, XL 6). */
export const CONCURRENT_TASKS_BY_VCPU: readonly { upToVcpus: number; tasks: number }[] = [
  { upToVcpus: 2, tasks: 2 },
  { upToVcpus: 4, tasks: 4 },
  { upToVcpus: Infinity, tasks: 6 },
];

/** When the computer's size is unknown: Orgo's smallest agent computer (the Hermes template is 2 vCPU / 8 GB). */
export const DEFAULT_CONCURRENT_TASKS = 2;

/**
 * Never below 2: a task that splits work into parallel tasks holds a slot while it waits for them, so one slot
 * could leave it waiting forever.
 */
export const MIN_CONCURRENT_TASKS = 2;
export const MAX_CONCURRENT_TASKS = 20;

/** How long a computer's size is trusted before it is read again (a resize changes it). */
export const SIZE_CACHE_MS = 10 * 60_000;

function override(): number | null {
  const raw = Number(process.env.OM_MAX_CONCURRENT_TASKS);
  return Number.isInteger(raw) && raw >= 1 ? Math.min(MAX_CONCURRENT_TASKS, Math.max(MIN_CONCURRENT_TASKS, raw)) : null;
}

/** The limit for a home computer with `vcpus` vCPUs (undefined when unknown). */
export function concurrentTasksFor(vcpus?: number | null): number {
  const forced = override();
  if (forced) return forced;
  if (!vcpus || !Number.isFinite(vcpus) || vcpus <= 0) return DEFAULT_CONCURRENT_TASKS;
  const tier = CONCURRENT_TASKS_BY_VCPU.find((t) => vcpus <= t.upToVcpus) ?? CONCURRENT_TASKS_BY_VCPU[CONCURRENT_TASKS_BY_VCPU.length - 1];
  return Math.min(MAX_CONCURRENT_TASKS, Math.max(MIN_CONCURRENT_TASKS, tier.tasks));
}
