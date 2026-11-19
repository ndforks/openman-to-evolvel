/**
 * One cloud computer in depth, for its detail page: details, rename, live readings, backups and restore,
 * resize within the catalog, SSH. Everything acts as the signed-in user with their Orgo key, inside their
 * workspace, and never changes the computer that runs the agent. Server only.
 */
import { ComputerRequestError, listComputers, type ComputerScope } from "@/lib/orgo/computers";
import { COMPUTER_SIZES, describeSize } from "@/lib/orgo/plans";
import type { CloudComputer } from "@/lib/orgo/types";
import type { OrgoComputer } from "@/lib/orgo/user-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;

export const PROTECTED_REASON = "This computer runs the agent and can't be changed from here.";

/* ---------- guards ---------- */

/** The computer as the list shows it. 404 for anything outside the user's workspace. */
export async function findComputer(scope: ComputerScope, id: string): Promise<CloudComputer> {
  if (!UUID.test(id)) throw new ComputerRequestError("No such computer.", 404);
  const computer = (await listComputers(scope)).find((c) => c.id.toLowerCase() === id.toLowerCase());
  if (!computer) throw new ComputerRequestError("No such computer.", 404);
  return computer;
}

/** Same, and refuses the agent's own computer. */
export async function findChangeable(scope: ComputerScope, id: string): Promise<CloudComputer> {
  const computer = await findComputer(scope, id);
  if (computer.protected) throw new ComputerRequestError(PROTECTED_REASON, 403);
  return computer;
}

/* ---------- rename ---------- */

export async function renameComputer(scope: ComputerScope, id: string, name: string): Promise<CloudComputer> {
  const computer = await findChangeable(scope, id);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new ComputerRequestError("Give the computer a name.", 400);
  if (clean.length > 80) throw new ComputerRequestError("Names are up to 80 characters.", 400);
  await scope.client.request<OrgoComputer>("PATCH", `/computers/${enc(computer.id)}`, { name: clean });
  return { ...(await findComputer(scope, id)), name: clean };
}

/* ---------- metrics ---------- */

export interface ComputerMetrics {
  /** Null when Orgo has no reading right now (stopped, or the host did not answer). */
  at: string;
  cpuPct: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  vcpus: number | null;
  /** 0 to 3: instance, desktop API and screen each healthy. */
  health: number | null;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** One point-in-time reading from Orgo (`GET /api/obs/{id}`); Orgo keeps no history, so the page keeps its own. */
export async function readMetrics(scope: ComputerScope, id: string): Promise<ComputerMetrics> {
  const computer = await findComputer(scope, id);
  const answer = await scope.client.request<{ resources?: Record<string, unknown> | null }>("GET", `/obs/${enc(computer.id)}`, undefined, { timeoutMs: 10_000 });
  const r = answer?.resources ?? {};
  return {
    at: new Date().toISOString(),
    cpuPct: n(r.cpuPct),
    memUsedBytes: n(r.memUsedBytes),
    memTotalBytes: n(r.memTotalBytes),
    diskUsedBytes: n(r.diskUsedBytes),
    diskTotalBytes: n(r.diskTotalBytes),
    vcpus: n(r.vcpus),
    health: n(r.healthScore),
  };
}

/* ---------- backups ---------- */

export interface ComputerBackup {
  id: string;
  createdAt: string;
  status: string;
  sizeBytes: number | null;
  expiresAt: string | null;
  restorable: boolean;
}

export interface BackupList {
  backups: ComputerBackup[];
  /** Orgo's own sentence about how long backups are kept. */
  retention: string | null;
  /** Restoring in place needs the computer stopped; Orgo says whether it is possible now. */
  restoreInPlace: boolean;
  /** Daily backups exist for Linux and Windows computers only. */
  supported: boolean;
}

export async function listBackups(scope: ComputerScope, id: string): Promise<BackupList> {
  const computer = await findComputer(scope, id);
  if (computer.os === "macos") return { backups: [], retention: null, restoreInPlace: false, supported: false };
  const answer = await scope.client.request<{
    backups?: { id?: string; created_at?: string; status?: string; compressed_bytes?: number; expires_at?: string | null; restorable?: boolean }[];
    restore_in_place?: boolean;
    retention?: { note?: string };
  }>("GET", `/computers/${enc(computer.id)}/backups?limit=20`);
  const backups = (answer?.backups ?? [])
    .filter((b) => typeof b.id === "string")
    .map((b) => ({
      id: b.id!,
      createdAt: b.created_at ?? "",
      status: b.status ?? "unknown",
      sizeBytes: n(b.compressed_bytes),
      expiresAt: b.expires_at ?? null,
      restorable: b.restorable !== false,
    }));
  return { backups, retention: answer?.retention?.note ?? null, restoreInPlace: answer?.restore_in_place === true, supported: true };
}

/**
 * Restores a backup. `as_new` makes a new computer from it (nothing is lost; it counts against the plan like a
 * create). `in_place` replaces this computer's disk and needs it stopped; Orgo runs it as an operation.
 */
export async function restoreBackup(scope: ComputerScope, id: string, backupId: string, mode: "as_new" | "in_place"): Promise<{ computerId?: string; operationId?: string; status?: string }> {
  const computer = await findChangeable(scope, id);
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(backupId)) throw new ComputerRequestError("Unknown backup.", 400);
  const answer = await scope.client.request<Record<string, unknown>>("POST", `/computers/${enc(computer.id)}/backup/restore`, { snapshot_id: backupId, mode }, { timeoutMs: 240_000 });
  const pick = (k: string) => (typeof answer?.[k] === "string" ? (answer[k] as string) : undefined);
  const nested = answer?.computer && typeof answer.computer === "object" ? (answer.computer as { id?: string }).id : undefined;
  return { computerId: nested ?? pick("computer_id") ?? pick("id"), operationId: pick("operation_id") ?? pick("operationId"), status: pick("status") };
}

/* ---------- resize ---------- */

export interface ResizeOption {
  id: string;
  name: string;
  vcpu: number;
  memoryGb: number;
  monthlyUsd: number;
  current: boolean;
  /** Smaller than the current RAM: Orgo only grows memory live, so these are left out. */
}

export interface ResizeInfo {
  supported: boolean;
  reason?: string;
  options: ResizeOption[];
  currentDiskGb: number | null;
  maxDiskGb: number | null;
}

/** The catalog sizes this computer can move to (Linux and Windows only; never past what Orgo allows it). */
export async function resizeInfo(scope: ComputerScope, id: string): Promise<ResizeInfo> {
  const computer = await findComputer(scope, id);
  if (computer.protected) return { supported: false, reason: PROTECTED_REASON, options: [], currentDiskGb: null, maxDiskGb: null };
  if (computer.os === "macos") return { supported: false, reason: "A Mac comes in one size.", options: [], currentDiskGb: null, maxDiskGb: null };
  const limits = await scope.client.request<Record<string, unknown>>("GET", `/computers/${enc(computer.id)}/resize`).catch(() => ({}) as Record<string, unknown>);
  const maxRam = n(limits.self_serve_max_ram_gb) ?? n(limits.max_ram_gb) ?? 32;
  const maxCpu = n(limits.self_serve_max_cpu) ?? n(limits.max_cpu) ?? 6;
  const options = COMPUTER_SIZES.filter((s) => s.memoryGb <= maxRam && s.vcpu <= maxCpu).map((s) => ({
    id: s.id,
    name: s.name,
    vcpu: s.vcpu,
    memoryGb: s.memoryGb,
    monthlyUsd: s.monthlyUsd,
    current: s.memoryGb === computer.specs.memoryGb && s.vcpu === computer.specs.vcpu,
  }));
  return { supported: true, options, currentDiskGb: n(limits.current_disk_gb), maxDiskGb: n(limits.max_disk_gb) };
}

export async function resizeComputer(scope: ComputerScope, id: string, sizeId: string): Promise<CloudComputer> {
  const computer = await findChangeable(scope, id);
  if (computer.os === "macos") throw new ComputerRequestError("A Mac comes in one size.", 422);
  const size = COMPUTER_SIZES.find((s) => s.id === sizeId);
  if (!size) throw new ComputerRequestError("Pick one of the sizes listed.", 400);
  if (computer.status !== "running") throw new ComputerRequestError("Start the computer first: Orgo resizes running computers only.", 409);
  await scope.client.resizeComputer(computer.id, { size: size.id as "medium" | "large" | "xl" });
  const after = await findComputer(scope, id).catch(() => null);
  return after ?? { ...computer, specs: { ...computer.specs, memoryGb: size.memoryGb, vcpu: size.vcpu }, ...describeSize(computer.os, size.memoryGb, size.vcpu) };
}

/* ---------- SSH (Linux) ---------- */

export interface SshInfo {
  supported: boolean;
  enabled: boolean;
  /** `ssh -p 22022 root@64.34.86.77`, once a key is set and the computer has picked it up. */
  command: string | null;
  user: string | null;
  host: string | null;
  port: number | null;
  keySet: boolean;
  /** Orgo applies a new key at the next restart. */
  pendingRestart: boolean;
}

export async function sshInfo(scope: ComputerScope, id: string): Promise<SshInfo> {
  const computer = await findComputer(scope, id);
  const none: SshInfo = { supported: false, enabled: false, command: null, user: null, host: null, port: null, keySet: false, pendingRestart: false };
  if (computer.os !== "linux" || computer.protected) return none;
  const a = await scope.client.request<Record<string, unknown>>("GET", `/computers/${enc(computer.id)}/ssh`);
  const host = typeof a.ipv4_host === "string" ? a.ipv4_host : null;
  const port = n(a.ipv4_port);
  const user = typeof a.ssh_user === "string" ? a.ssh_user : "root";
  const command = typeof a.ssh_command === "string" ? a.ssh_command : host && port ? `ssh -p ${port} ${user}@${host}` : null;
  const keySet = a.authorized_key_set === true;
  return { supported: true, enabled: a.enabled === true, command, user, host, port, keySet, pendingRestart: keySet && !command };
}

const KEY = /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com) [A-Za-z0-9+/=]{40,}( [^\n]{0,200})?$/;

export async function setSshKey(scope: ComputerScope, id: string, publicKey: string): Promise<SshInfo> {
  const computer = await findChangeable(scope, id);
  if (computer.os !== "linux") throw new ComputerRequestError("SSH is available for Linux computers.", 422);
  const key = publicKey.trim();
  if (!KEY.test(key)) throw new ComputerRequestError("Paste one public key, such as the contents of ~/.ssh/id_ed25519.pub.", 400);
  await scope.client.request("POST", `/computers/${enc(computer.id)}/ssh`, { public_key: key });
  return sshInfo(scope, id);
}

export async function disableSsh(scope: ComputerScope, id: string): Promise<SshInfo> {
  const computer = await findChangeable(scope, id);
  await scope.client.request("DELETE", `/computers/${enc(computer.id)}/ssh`);
  return sshInfo(scope, id);
}
