// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** What `/api/computers` sends to the browser. Shared by the route handlers and the UI. No secrets live here. */

/** Simplified lifecycle state the UI draws. `raw` on the computer keeps Orgo's own word. */
export type CloudComputerStatus = "starting" | "running" | "restarting" | "updating" | "sleeping" | "waking" | "stopped" | "error" | "deleted";

export interface CloudComputer {
  id: string;
  name: string;
  /** "linux" | "windows" | "macos", or whatever else Orgo reports. */
  os: string;
  status: CloudComputerStatus;
  /** "Running", "Starting"... */
  statusLabel: string;
  /** Orgo's own status word (`creating`, `frozen`...). */
  rawStatus: string;
  /** This product's plan name when the size matches one ("Standard"), else null. */
  plan: string | null;
  /** Orgo's size name ("Medium", "XL") or the bare numbers. */
  size: string;
  specs: { memoryGb: number; vcpu: number; storageGb: number | null };
  /** Where Orgo put it, from its host: "New York", "London". */
  location: string;
  createdAt: string | null;
  /** When Orgo deletes it. null: it is kept until someone deletes it. */
  endsAt: string | null;
  /** True when it has an end (a temporary computer). */
  temporary: boolean;
  /** True for the computer that runs the agent. It can be listed and viewed, never changed. */
  protected: boolean;
}

export interface ComputersResponse {
  computers: CloudComputer[];
  /** False when the server has no Orgo key or workspace; the list is then empty and `reason` says why. */
  configured: boolean;
  reason?: string;
}

/** Body of `POST /api/computers`. */
export interface CreateComputerBody {
  os: string;
  plan: string;
  storageGb: number;
  location: string;
  name: string;
  /** Give the computer an end: Orgo deletes it after a week. */
  temporary?: boolean;
}

export interface CreateComputerResponse {
  computer: CloudComputer;
}

/** Statuses that are on their way somewhere, so the list should be re-read soon. */
export const TRANSITIONAL_STATUSES: readonly CloudComputerStatus[] = ["starting", "restarting", "updating", "waking"];

export function isTransitional(status: CloudComputerStatus): boolean {
  return TRANSITIONAL_STATUSES.includes(status);
}
