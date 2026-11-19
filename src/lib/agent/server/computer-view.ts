/**
 * Which screen a task's computer panel streams: the computer the task was given, or the home computer the
 * agent works on. The URL carries that computer's VNC password, so only the task's owner may get it.
 */
import type { ComputerView, RunTarget } from "@/lib/agent/types";
import { devUserEnabled } from "@/lib/session";
import { computerFor, orgoClientFor } from "./connection";
import { remoteComputerId } from "./remote";

function dimension(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 320 && n <= 7680 ? n : fallback;
}

function screenSize(resolution: unknown): { width: number; height: number } {
  const match = typeof resolution === "string" ? /^(\d{3,4})x(\d{3,4})/.exec(resolution) : null;
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 1280, height: 720 };
}

async function liveView(ownerId: string, computerId: string, viewOnly: boolean): Promise<ComputerView | null> {
  const orgo = orgoClientFor(ownerId);
  if (!orgo) return null;
  const listed = (await orgo.listComputers()).find((c) => c.id.toLowerCase() === computerId.toLowerCase());
  if (!listed) return null;
  const computer = await orgo.getComputer(listed.id);
  const password = typeof computer.vnc_password === "string" ? computer.vnc_password : "";
  const vncUrl = computer.status === "running" && password ? orgo.vncSocketUrl(computer.id, password) : null;
  return { vncUrl, viewOnly, ...screenSize(computer.instance_details?.resolution ?? listed.instance_details?.resolution) };
}

/** The view for a task. Throws only on unexpected errors; an unknown computer gives a view with no URL. */
export async function taskComputerView(ownerId: string, target: RunTarget | undefined): Promise<ComputerView> {
  const remote = remoteComputerId(target);
  // The user's own work computer: they may take over its screen.
  if (remote) return (await liveView(ownerId, remote, false).catch(() => null)) ?? { vncUrl: null, viewOnly: false, width: 1280, height: 720 };
  const env = process.env.ORGO_VNC_URL?.trim();
  const fallback: ComputerView = {
    vncUrl: env || null,
    viewOnly: process.env.ORGO_VNC_VIEW_ONLY !== "false",
    width: dimension(process.env.ORGO_SCREEN_WIDTH, 1280),
    height: dimension(process.env.ORGO_SCREEN_HEIGHT, 720),
  };
  // The env stream is the dev computer's (its URL carries that computer's root password): only the dev user and
  // the local store's owner may get it. Everyone else watches their own home computer, or nothing.
  const home = computerFor(ownerId)?.computerId;
  const envComputer = process.env.ORGO_COMPUTER_ID?.trim().toLowerCase();
  const devOwner = devUserEnabled() && (ownerId === "local" || ownerId === "dev" || (!!home && home.toLowerCase() === envComputer));
  const none: ComputerView = { ...fallback, vncUrl: null };
  if (devOwner && env) return fallback;
  if (!home) return devOwner ? fallback : none;
  return (await liveView(ownerId, home, true).catch(() => null)) ?? (devOwner ? fallback : none);
}
