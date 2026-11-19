// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Which of the computers already in a workspace can become the person's agent computer, instead of creating a new one.
 * Pure (no server imports): read by `GET /api/me/computers`, by `adoptComputer` and by the tests.
 *
 * - Hermes: made from Orgo's Hermes template, or Orgo already set Hermes up on it (`instance_details.installedAgent`).
 *   Setup only configures it.
 * - Plain Linux: no agent yet; setup asks Orgo to install Hermes on it first (`POST /computers/{id}/agent/install`).
 * - Not suitable: Windows or Mac, another agent installed, too small, set to end, or gone.
 */
import type { OrgoComputer } from "@/lib/orgo/user-client";

export type CandidateKind = "hermes" | "linux" | "unsuitable";

export interface Candidate {
  id: string;
  name: string;
  os: string;
  status: string;
  cpu: number | null;
  ramGb: number | null;
  diskGb: number | null;
  kind: CandidateKind;
  suitable: boolean;
  /** One line for the person. */
  note: string;
}

/** The agent's floor: Orgo's Hermes template is 2 vCPU and 8 GB; 4 GB still runs it. */
export const MIN_CPU = 2;
export const MIN_RAM_GB = 4;

const GONE = new Set(["deleted", "ended", "deleting", "error", "failed"]);

export function hasHermes(c: Pick<OrgoComputer, "instance_details">): boolean {
  const d = c.instance_details;
  if (!d) return false;
  if (d.installedAgent === "hermes") return true;
  return Array.isArray(d.templateTerminals) && d.templateTerminals.some((t) => /hermes/i.test(t?.name ?? ""));
}

export function classifyComputer(c: OrgoComputer): Candidate {
  const base = {
    id: c.id,
    name: c.name,
    os: c.os ?? "linux",
    status: c.status ?? "unknown",
    cpu: typeof c.cpu === "number" ? c.cpu : null,
    ramGb: typeof c.ram === "number" ? c.ram : null,
    diskGb: typeof c.disk_size_gb === "number" ? c.disk_size_gb : null,
  };
  const no = (note: string): Candidate => ({ ...base, kind: "unsuitable", suitable: false, note });
  if (GONE.has(base.status)) return no("This computer is gone or failed.");
  if (base.os !== "linux") return no(`The agent runs on Linux; this is a ${base.os === "windows" ? "Windows" : base.os === "macos" ? "Mac" : base.os} computer.`);
  if (c.ends_at) return no("This computer is set to end. Pick one that stays.");
  const other = c.instance_details?.installedAgent;
  if (other && other !== "hermes") return no(`It already runs another agent (${other}).`);
  if ((base.cpu ?? MIN_CPU) < MIN_CPU || (base.ramGb ?? MIN_RAM_GB) < MIN_RAM_GB) return no(`Too small: the agent needs ${MIN_CPU} vCPU and ${MIN_RAM_GB} GB of memory or more.`);
  if (hasHermes(c)) return { ...base, kind: "hermes", suitable: true, note: "Runs Orgo's Hermes agent. Setup only connects it to OpenMan." };
  return { ...base, kind: "linux", suitable: true, note: "Plain Linux. Orgo installs the Hermes agent on it first, which takes a few minutes; whatever already runs on it keeps running." };
}

/**
 * Suitable ones first (Hermes before plain Linux), then the rest, each by name. `inUse` names computers that already
 * run another OpenMan sign-in's agent (setting one up here would replace that agent's key and cut it off).
 */
export function rankCandidates(list: OrgoComputer[], inUse: ReadonlyMap<string, string> = new Map()): Candidate[] {
  const order: Record<CandidateKind, number> = { hermes: 0, linux: 1, unsuitable: 2 };
  return list
    .map((c) => {
      const candidate = classifyComputer(c);
      const who = inUse.get(c.id);
      return who && candidate.suitable ? { ...candidate, kind: "unsuitable" as const, suitable: false, note: `Already the agent computer of ${who}. Setting it up here would disconnect that one.` } : candidate;
    })
    .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}
