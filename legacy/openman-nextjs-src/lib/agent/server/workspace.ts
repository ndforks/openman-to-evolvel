// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * A task's workspace on the computer it works on:
 * - project knowledge files, copied into the task's folder before its first run (`placeProjectFiles`), from the
 *   snapshot taken when the task was created (file changes apply to tasks created afterwards);
 * - the project's instructions, read fresh for every run (instruction edits apply on the next message);
 * - files restored into a folder the idle sweep removed (`restoreSwept`), from the server's file cache.
 * Server only.
 */
import { projectAccessById } from "@/lib/db/project-members";
import { readProjectFile } from "@/lib/db/projects";
import type { OrgoClient } from "@/lib/orgo/user-client";
import type { StoredFile } from "@/lib/store/types";
import { shellQuote } from "./computer";
import { computerFor, orgoClientFor } from "./connection";
import type { ExtMeta } from "./task-meta";
import { safeFileName, transfer } from "./uploads";

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Runs `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/**
 * Copies the task's snapshot of project files to `dir` on `computerId` (the home computer, or a Linux computer the
 * task was given). Returns the names copied. Files deleted from the project since the task was created are skipped.
 */
export async function placeProjectFiles(orgo: OrgoClient, computerId: string, meta: ExtMeta, dir: string): Promise<string[]> {
  const snap = meta.projectFiles;
  if (!snap?.files.length) return [];
  const placed: string[] = [];
  const used = new Set<string>();
  await pool(snap.files, 4, async (f) => {
    const found = await readProjectFile(snap.owner, snap.project, f.id).catch(() => null);
    if (!found) return;
    let name = safeFileName(f.name);
    // Two files with one name keep both.
    for (let i = 2; used.has(name); i++) name = safeFileName(`${i}-${f.name}`);
    used.add(name);
    await transfer(orgo, computerId, dir, name, new Uint8Array(found.bytes));
    placed.push(name);
  });
  return placed.sort();
}

/** What the agent is told about the project files it was given. */
export function projectFilesInstructions(dir: string, names: string[]): string {
  if (!names.length) return "";
  return `The project's knowledge files are in ${dir}: ${names.map((n) => `"${n}"`).join(", ")}. Read the ones that matter for the task before you start; treat them as reference material from the user.`;
}

/**
 * Prepares project files for a run on the home computer (folder `folder`) or on a Linux computer the task was
 * given (`remote`). Copies once per task (`meta.projectFilesAt`). Returns instructions for the agent, or "".
 */
export async function prepareProjectFiles(ownerId: string, meta: ExtMeta, where: { folder: string } | { remote: { computerId: string; os: string }; taskId: string }): Promise<string> {
  const snap = meta.projectFiles;
  if (!snap?.files.length) return "";
  const names = snap.files.map((f) => safeFileName(f.name));
  if (meta.projectFilesAt) return projectFilesInstructions(meta.projectFilesAt, names);
  const orgo = orgoClientFor(ownerId);
  if (!orgo) return "";
  let computerId: string;
  let dir: string;
  if ("folder" in where) {
    const home = computerFor(ownerId)?.computerId;
    if (!home) return "";
    computerId = home;
    dir = `${where.folder}/project-files`;
  } else {
    // Orgo's file transfer and the paths below are Linux ones; other systems get the files described instead.
    if (where.remote.os !== "linux") {
      return `The project has knowledge files (${names.join(", ")}), but they could not be copied to this ${where.remote.os} computer. Ask the user for what you need from them.`;
    }
    computerId = where.remote.computerId;
    dir = `/root/tasks/${where.taskId}/project-files`;
  }
  try {
    const placed = await placeProjectFiles(orgo, computerId, meta, dir);
    meta.projectFilesAt = dir;
    return projectFilesInstructions(dir, placed);
  } catch (err) {
    console.warn("[workspace] could not copy the project files:", errorText(err));
    return `The project has knowledge files (${names.join(", ")}) that could not be copied to your computer this time.`;
  }
}

/** The project's current instructions for a task's run (fresh every run), or "" when it has none or is gone. */
export async function projectInstructions(ownerId: string, projectId: string | null | undefined): Promise<string> {
  if (!projectId) return "";
  const access = await projectAccessById(ownerId, projectId).catch(() => null);
  const text = access?.project.instructions.trim();
  return text ? `Project "${access!.project.name}" instructions:\n${text}` : "";
}

/**
 * After the idle sweep removed a task's folder: puts the files the task delivered or was given back where they were,
 * from the server's cache (`loadCached`). Returns how many came back.
 */
export async function restoreSwept(ownerId: string, files: StoredFile[], loadCached: (file: StoredFile) => Promise<Buffer | null>): Promise<number> {
  const orgo = orgoClientFor(ownerId);
  const home = computerFor(ownerId)?.computerId;
  if (!orgo || !home) return 0;
  let restored = 0;
  await pool(
    files.filter((f) => f.path.startsWith("/root/")),
    4,
    async (f) => {
      const bytes = await loadCached(f).catch(() => null);
      if (!bytes) return;
      const slash = f.path.lastIndexOf("/");
      await transfer(orgo, home, f.path.slice(0, slash), f.path.slice(slash + 1), new Uint8Array(bytes))
        .then(() => void restored++)
        .catch((err) => console.warn(`[workspace] could not restore ${f.name}:`, errorText(err)));
    },
  );
  return restored;
}

/** Shell for the sweep on one home computer: removes the named task folders and upload folders. */
export function sweepScript(taskIds: string[], uploadDirs: string[]): string {
  const ids = taskIds.filter((id) => /^[A-Za-z0-9]{8,64}$/.test(id));
  const ups = uploadDirs.filter((d) => /^\/root\/uploads\/[a-f0-9]{24}$/.test(d));
  return [
    "export HOME=/root; n=0",
    ...ids.map((id) => `[ -d ${shellQuote(`/root/tasks/${id}`)} ] && rm -rf ${shellQuote(`/root/tasks/${id}`)} && n=$((n+1))`),
    ...ups.map((d) => `rm -rf ${shellQuote(d)}`),
    'echo "OM_SWEPT $n"',
  ].join("\n");
}
