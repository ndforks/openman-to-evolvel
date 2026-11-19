/**
 * Running a task on a computer the user chose, while the agent itself stays on their home computer.
 *
 * How: the task's runs go to a second Hermes profile on the home computer (`om-remote`, reached at
 * `/p/om-remote/v1/...` on the same API server). That profile has no local terminal, file, browser, code or
 * computer-use tools; its only hands are the `omtarget` MCP tools (see `remote-mcp.ts`), which call Orgo's
 * Desktop API for the chosen computer. So every shell command, file and screen action of the task happens
 * on that computer, on any OS Orgo runs (Linux, Windows, macOS).
 *
 * The credential: the chosen computer's Desktop API token, which reaches that one computer only. It is
 * written to the home computer (mode 600, under a per-task handle) right before each run and deleted when
 * the run ends. Orgo has no expiring or scoped alternative that works for every OS and every key
 * (one-computer keys are Linux only, behind a flag, and need an account-wide key). The browser never sees it.
 *
 * "Temporary cloud computer" stays the home computer's own workspace, with a folder per task (`taskFolder`).
 */
import { createHash } from "node:crypto";
import type { RunTarget } from "@/lib/agent/types";
import type { OrgoClient } from "@/lib/orgo/user-client";
import type { ComputerConfig } from "./computer";
import { computerFor, orgoClientFor } from "./connection";
import { REMOTE_MCP_VERSION, REMOTE_PROFILE, remoteSetupScript } from "./remote-mcp";

export { REMOTE_PROFILE };

export interface RemoteTarget {
  handle: string;
  computerId: string;
  name: string;
  os: string;
}

const g = globalThis as typeof globalThis & { __omRemoteReady?: Map<string, Promise<void>>; __omTaskFolders?: Map<string, string> };
const ready = (g.__omRemoteReady ??= new Map());
const folders = (g.__omTaskFolders ??= new Map());

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The persistent computer a task was pointed at, or null for the home computer's own workspace. */
export function remoteComputerId(target: RunTarget | undefined): string | null {
  return target?.kind === "cloud-persistent" && target.computerId ? target.computerId : null;
}

/**
 * The task's handle on the home computer: derived from the task id and a server secret, so the relay can
 * clean up after a restart without storing it, and nobody without the secret can guess it.
 */
export function remoteHandle(taskId: string): string {
  const secret = process.env.APP_ENCRYPTION_KEY || process.env.SESSION_SECRET || process.env.HERMES_API_KEY || "openman";
  return `t${createHash("sha256").update(`${secret}:remote:${taskId}`).digest("base64url").slice(0, 31)}`;
}

function clientAndHome(ownerId: string): { orgo: OrgoClient; homeId: string } {
  const orgo = orgoClientFor(ownerId);
  const homeId = computerFor(ownerId)?.computerId;
  if (!orgo || !homeId) throw new Error("Your agent computer isn't connected, so the task can't reach another computer.");
  return { orgo, homeId };
}

/** Installs (or updates) the remote profile on the home computer once per server process, and waits until Hermes serves it. */
function ensureProfile(orgo: OrgoClient, homeId: string, onWait?: () => void): Promise<void> {
  const key = `${homeId}:${REMOTE_MCP_VERSION}`;
  let known = ready.get(key);
  if (!known) {
    known = (async () => {
      const setup = await orgo.bash(homeId, remoteSetupScript(), 120);
      if (/OM_SETUP missing=hermes/.test(setup.output)) throw new Error("Hermes isn't installed on your agent computer.");
      if (!/OM_SETUP fresh=[01]/.test(setup.output)) throw new Error(`Couldn't prepare your agent computer: ${(setup.error || setup.output).slice(-300)}`);
      // Unchanged: Hermes already knows the profile and starts the tools on demand.
      if (/OM_SETUP fresh=0/.test(setup.output)) return;
      // New or changed: Hermes rescans its profiles about every 30 s and starts the tools then; wait for them
      // (up to two minutes, then go ahead: a server already running reloads the new script by itself).
      for (let attempt = 0; attempt < 24; attempt++) {
        // `[o]` keeps pgrep from matching its own command line.
        const probe = await orgo.bash(homeId, "pgrep -f '[o]mtarget.py' >/dev/null && echo up || echo down", 15);
        if (probe.output.includes("up") && attempt > 0) return;
        if (attempt === 0) onWait?.();
        await new Promise((r) => setTimeout(r, 5000));
      }
    })();
    ready.set(key, known);
    known.catch(() => ready.delete(key));
  }
  return known;
}

/**
 * Connects a task to the computer it was given, right before a run: checks the computer is the owner's,
 * wakes it if needed, prepares the remote profile, and writes the per-task credential on the home computer.
 */
export async function connectTarget(ownerId: string, taskId: string, computerId: string, onWait?: (brief: string) => void): Promise<RemoteTarget> {
  const { orgo, homeId } = clientAndHome(ownerId);
  if (computerId.toLowerCase() === homeId.toLowerCase()) throw new Error("That computer runs the agent itself. Pick another computer, or a temporary one.");
  const listed = (await orgo.listComputers()).find((c) => c.id.toLowerCase() === computerId.toLowerCase());
  if (!listed || listed.status === "deleted") throw new Error("The computer this task was given no longer exists. Pick another one.");
  const name = listed.name;
  const os = typeof listed.os === "string" ? listed.os : "linux";
  if (listed.status !== "running") {
    onWait?.(`Starting ${name}`);
    await orgo.startComputer(listed.id).catch((err) => console.warn(`[remote] could not start ${listed.id}:`, errorText(err)));
  }
  await ensureProfile(orgo, homeId, () => onWait?.(`Connecting to ${name}`));
  const creds = await orgo.vncPassword(listed.id);
  const token = creds.desktop_api_token || creds.password;
  if (!token) throw new Error(`Orgo didn't give access to ${name}.`);
  const handle = remoteHandle(taskId);
  const blob = Buffer.from(JSON.stringify({ api: orgo.baseUrl, computer_id: listed.id, token, os, name })).toString("base64");
  const wrote = await orgo.bash(homeId, `umask 077; mkdir -p "$HOME/.openman/targets" && echo '${blob}' | base64 -d > "$HOME/.openman/targets/${handle}.json" && echo OK`, 30);
  if (!wrote.output.includes("OK")) throw new Error("Couldn't connect your agent computer to the task's computer.");
  return { handle, computerId: listed.id, name, os };
}

/** Removes the task's credential from the home computer. Safe to call when there is none. */
export async function disconnectTarget(ownerId: string, taskId: string): Promise<void> {
  const orgo = orgoClientFor(ownerId);
  const homeId = computerFor(ownerId)?.computerId;
  if (!orgo || !homeId) return;
  await orgo.bash(homeId, `rm -f "$HOME/.openman/targets/${remoteHandle(taskId)}.json"`, 20).catch((err) => console.warn(`[remote] could not disconnect task ${taskId}:`, errorText(err)));
}

const OS_LABEL: Record<string, string> = { linux: "Linux", windows: "Windows", macos: "macOS" };

/** What the agent is told about where it works, layered on its instructions for a remote run. */
export function remoteInstructions(target: RemoteTarget): string {
  const os = OS_LABEL[target.os] ?? target.os;
  const shell = target.os === "windows" ? "PowerShell" : "bash";
  const home = target.os === "windows" ? "C:\\Users\\Administrator" : target.os === "macos" ? "the user's home folder" : "/root";
  return [
    `This task runs on the user's ${os} computer "${target.name}", not on the machine you run on.`,
    `Do all work there with the omtarget tools (mcp__omtarget__shell, write_file, read_file, list_dir, open_url, screenshot, click, type_text, press_key, scroll), always passing target="${target.handle}".`,
    `Its shell is ${shell}. Save files under ${home} unless the user names a place, and give each file's full path on that computer in your final answer.`,
    "To show a web page, use open_url, then screenshot to see it. The user watches that computer's screen live.",
  ].join(" ");
}

/**
 * The task's own folder on the home computer (`~/tasks/<id>`), made before its first run. Null when the
 * home computer can't be reached; the run goes ahead in the home folder then.
 */
export async function taskFolder(ownerId: string, taskId: string): Promise<string | null> {
  const known = folders.get(taskId);
  if (known) return known;
  const orgo = orgoClientFor(ownerId);
  const homeId = computerFor(ownerId)?.computerId;
  if (!orgo || !homeId || !/^[A-Za-z0-9]{8,64}$/.test(taskId)) return null;
  try {
    const made = await orgo.bash(homeId, `mkdir -p "$HOME/tasks/${taskId}" && cd "$HOME/tasks/${taskId}" && pwd`, 20);
    const path = made.output.trim().split("\n").pop()?.trim();
    if (!path?.startsWith("/")) return null;
    folders.set(taskId, path);
    return path;
  } catch (err) {
    console.warn(`[remote] could not make the folder for task ${taskId}:`, errorText(err));
    return null;
  }
}

/** Forgets the remembered folder of a task (it was removed by the idle sweep), so the next run makes it again. */
export function forgetTaskFolder(taskId: string): void {
  folders.delete(taskId);
}

export function folderInstructions(path: string): string {
  return `This task's working folder is ${path}. Start every shell command there (cd ${path} first), and save every file you make inside it unless the user names another place.`;
}

const g2 = globalThis as typeof globalThis & { __omTargetCfg?: Map<string, { at: number; cfg: ComputerConfig }> };
const targetCfgs = (g2.__omTargetCfg ??= new Map());

/**
 * How the server itself reads files on a task's computer: Orgo's Desktop API for that computer, with its
 * token (kept in server memory for ten minutes). Throws when the computer is not the owner's.
 */
export async function targetComputerConfig(ownerId: string, computerId: string): Promise<ComputerConfig> {
  const key = `${ownerId}:${computerId}`;
  const known = targetCfgs.get(key);
  if (known && Date.now() - known.at < 10 * 60_000) return known.cfg;
  const orgo = orgoClientFor(ownerId);
  if (!orgo) throw new Error("No Orgo access for this account.");
  const listed = (await orgo.listComputers()).find((c) => c.id.toLowerCase() === computerId.toLowerCase());
  if (!listed) throw new Error("No such computer.");
  const creds = await orgo.vncPassword(listed.id);
  const token = creds.desktop_api_token || creds.password;
  const cfg: ComputerConfig = { baseUrl: orgo.baseUrl, computerId: listed.id, token };
  targetCfgs.set(key, { at: Date.now(), cfg });
  return cfg;
}
