/**
 * What the `/api/computers` routes do, on top of the raw Orgo client: turn Orgo's objects into the
 * shape the UI draws, keep every change inside the configured workspace, and never touch the
 * computer that runs the agent. Server only.
 */
import type { ComputerView } from "@/lib/agent/types";
import { isUuid } from "./api";
import { OrgoError, type OrgoClient, type OrgoComputer, type OrgoCreateComputerBody as OrgoCreateBody } from "./user-client";
import { NO_REGION_NOTE, ORGO_LIMITS, ORGO_LOCATION, LOCATION_OPTIONS, describeSize, hasConfigurableStorage, locationFromHost, planMapping, type ComputerOs, type ComputerPlanId } from "./plans";
import type { CloudComputer, CloudComputerStatus, CreateComputerBody } from "./types";

/** A request this app refuses before it reaches Orgo. `status` is the HTTP status to answer with. */
export class ComputerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ComputerRequestError";
  }
}

/* ---------- scope ---------- */

/**
 * Who the routes act for: the signed-in user's Orgo client, their workspace, and the computers that may be
 * read but never changed from here (their home computer, which runs the agent).
 */
export interface ComputerScope {
  client: OrgoClient;
  workspaceId: string;
  protectedIds: readonly string[];
}

/* ---------- the protected computer ---------- */

const PROTECTED_REASON = "This computer runs the agent and can't be changed from here.";
function isProtected(scope: ComputerScope, computer: { id: string }): boolean {
  const id = computer.id.toLowerCase();
  return scope.protectedIds.some((candidate) => candidate.toLowerCase() === id);
}

function listWorkspaceComputers(scope: ComputerScope): Promise<OrgoComputer[]> {
  return scope.client.listComputers(scope.workspaceId);
}

/* ---------- Orgo -> UI ---------- */

const STATUS: Record<string, { status: CloudComputerStatus; label: string }> = {
  creating: { status: "starting", label: "Starting" },
  running: { status: "running", label: "Running" },
  restarting: { status: "restarting", label: "Restarting" },
  updating: { status: "updating", label: "Updating" },
  suspending: { status: "sleeping", label: "Going to sleep" },
  suspended: { status: "sleeping", label: "Asleep" },
  resuming: { status: "waking", label: "Waking up" },
  frozen: { status: "stopped", label: "Stopped" },
  stopped: { status: "stopped", label: "Stopped" },
  error: { status: "error", label: "Error" },
  deleted: { status: "deleted", label: "Deleted" },
};

function toCloudComputer(scope: ComputerScope, raw: OrgoComputer): CloudComputer {
  const os = typeof raw.os === "string" ? raw.os : "linux";
  const memoryGb = Number(raw.ram) || 0;
  const vcpu = Number(raw.cpu) || 0;
  const rawStatus = typeof raw.status === "string" ? raw.status : "unknown";
  const known = STATUS[rawStatus] ?? { status: "error" as const, label: rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) };
  const { plan, size } = describeSize(os, memoryGb, vcpu);
  const locked = isProtected(scope, raw);
  return {
    id: raw.id,
    name: raw.name,
    os,
    status: known.status,
    statusLabel: known.label,
    rawStatus,
    // The agent's computer was not made from a plan here, so it is described by its Orgo size.
    plan: locked ? null : plan,
    size,
    specs: { memoryGb, vcpu, storageGb: typeof raw.disk_size_gb === "number" ? raw.disk_size_gb : null },
    location: locationFromHost(raw.host_id),
    createdAt: raw.created_at ?? null,
    endsAt: raw.ends_at ?? null,
    temporary: !!raw.ends_at,
    protected: locked,
  };
}

/** The workspace's computers, oldest first, without anything Orgo marks as deleted. */
export async function listComputers(scope: ComputerScope): Promise<CloudComputer[]> {
  const raw = await listWorkspaceComputers(scope);
  return raw
    .filter((computer) => computer.status !== "deleted")
    .map((computer) => toCloudComputer(scope, computer))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/* ---------- guards ---------- */

/**
 * Finds a computer by id in the configured workspace. Every route that names a computer goes through
 * here first, so an id from another workspace (or an Orgo instance id) is a plain 404.
 */
async function findInWorkspace(scope: ComputerScope, id: string): Promise<OrgoComputer> {
  if (!isUuid(id)) throw new ComputerRequestError("No such computer.", 404);
  const computer = (await listWorkspaceComputers(scope)).find((candidate) => candidate.id.toLowerCase() === id.toLowerCase());
  if (!computer || computer.status === "deleted") throw new ComputerRequestError("No such computer.", 404);
  return computer;
}

/** Same as `findInWorkspace`, and refuses the computer that runs the agent. */
async function findChangeable(scope: ComputerScope, id: string): Promise<OrgoComputer> {
  const computer = await findInWorkspace(scope, id);
  if (isProtected(scope, computer)) throw new ComputerRequestError(PROTECTED_REASON, 403);
  return computer;
}

/* ---------- create ---------- */

const OSES: readonly ComputerOs[] = ["linux", "windows", "macos"];
const PLANS: readonly ComputerPlanId[] = ["standard", "advanced", "performance"];
const NAME_MAX = 80;
const NAME_TRIES = 20;

/** `base`, or `base 2`, `base 3`... so that it is free in the workspace. Orgo wants unique names. */
function freeName(base: string, taken: Set<string>): string {
  for (let n = 1; n <= 200; n += 1) {
    const suffix = n === 1 ? "" : ` ${n}`;
    const candidate = `${base.slice(0, NAME_MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, NAME_MAX - 9)} ${Date.now().toString(36)}`;
}

export async function createCloudComputer(scope: ComputerScope, input: CreateComputerBody): Promise<CloudComputer> {
  const os = OSES.find((candidate) => candidate === input.os);
  const plan = PLANS.find((candidate) => candidate === input.plan);
  if (!os) throw new ComputerRequestError("Pick Linux, Windows or Mac.", 400);
  const mapping = plan ? planMapping(os, plan) : null;
  if (!plan || !mapping) throw new ComputerRequestError("That plan doesn't exist for this operating system.", 400);
  if (mapping.unavailable) throw new ComputerRequestError(mapping.unavailable, 422);

  const location = LOCATION_OPTIONS.find((option) => option.value === input.location);
  if (!location) throw new ComputerRequestError("Unknown location.", 400);
  if (location.unavailable || location.value !== ORGO_LOCATION) throw new ComputerRequestError(`${location.label} isn't available. ${NO_REGION_NOTE}`, 422);

  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ComputerRequestError("Give the computer a name.", 400);

  const body: OrgoCreateBody = { workspace_id: scope.workspaceId, name, os, ...mapping.request };
  if (hasConfigurableStorage(os)) {
    const storageGb = Math.round(input.storageGb);
    if (!Number.isFinite(storageGb) || storageGb < ORGO_LIMITS.minStorageGb) throw new ComputerRequestError(`Storage starts at ${ORGO_LIMITS.minStorageGb} GB.`, 400);
    if (storageGb > ORGO_LIMITS.maxStorageGb) throw new ComputerRequestError(`${storageGb} GB isn't available: Orgo allows ${ORGO_LIMITS.maxStorageGb} GB per computer.`, 422);
    body.disk_size_gb = storageGb;
    // On the account's plan, never by the hour from credit: past the plan's room Orgo refuses instead of charging.
    body.billing_mode = "plan";
    if (input.temporary) body.ends_in_hours = ORGO_LIMITS.temporaryHours;
  } else if (input.temporary) {
    throw new ComputerRequestError("A Mac can't be temporary: Orgo only gives Linux and Windows computers an end.", 422);
  }

  const existing = await listWorkspaceComputers(scope);
  const taken = new Set(existing.map((computer) => computer.name.trim().toLowerCase()));

  let created: OrgoComputer | null = null;
  for (let attempt = 0; attempt < NAME_TRIES && !created; attempt += 1) {
    body.name = freeName(name, taken);
    try {
      created = await scope.client.createComputer(body);
    } catch (err) {
      // Someone else took the name between the list and the create: move on to the next one.
      if (err instanceof OrgoError && err.status === 409 && err.code?.toUpperCase() === "NAME_TAKEN") {
        taken.add(body.name.toLowerCase());
        continue;
      }
      throw err;
    }
  }
  if (!created) throw new ComputerRequestError("Couldn't find a free name for the computer. Try another name.", 409);

  // The workspace listing has the disk size and the host; the create answer has neither.
  const listed = (await listWorkspaceComputers(scope).catch(() => [])).find((computer) => computer.id === created.id);
  return toCloudComputer(scope, listed ?? { ...created, disk_size_gb: body.disk_size_gb ?? null });
}

/* ---------- delete, restart, view ---------- */

export async function deleteCloudComputer(scope: ComputerScope, id: string): Promise<void> {
  const computer = await findChangeable(scope, id);
  await scope.client.deleteComputer(computer.id);
}

export async function restartCloudComputer(scope: ComputerScope, id: string): Promise<CloudComputer> {
  const computer = await findChangeable(scope, id);
  await scope.client.restartComputer(computer.id);
  const after = (await listWorkspaceComputers(scope).catch(() => [])).find((candidate) => candidate.id === computer.id);
  return toCloudComputer(scope, after ?? { ...computer, status: "running" });
}

function screenSize(resolution: unknown): { width: number; height: number } {
  const match = typeof resolution === "string" ? /^(\d{3,4})x(\d{3,4})/.exec(resolution) : null;
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 1280, height: 720 };
}

/**
 * Where to watch a computer's screen with noVNC. Reading is allowed for every computer in the workspace,
 * the agent's included, which is always handed out view-only.
 *
 * The URL carries the computer's VNC password. Orgo has no view-only password, so `viewOnly` is a request
 * to the viewer, not a guarantee.
 */
export async function viewCloudComputer(scope: ComputerScope, id: string): Promise<ComputerView> {
  const listed = await findInWorkspace(scope, id);
  const computer = await scope.client.getComputer(listed.id);
  const size = screenSize(computer.instance_details?.resolution ?? listed.instance_details?.resolution);
  const password = typeof computer.vnc_password === "string" ? computer.vnc_password : "";
  const vncUrl = computer.status === "running" && password ? scope.client.vncSocketUrl(computer.id, password) : null;
  return { vncUrl, viewOnly: isProtected(scope, listed), ...size };
}
