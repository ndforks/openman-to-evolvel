/**
 * Files a task produced: where they are on the agent's computer, and a local copy of each one
 * fetched so far (under `.data/files/<taskId>/`), so a file opens instantly the second time and
 * stays available after the agent has changed or removed it.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentEvent } from "@/lib/agent/types";
import { isValidTaskId, type StoredFile, type TaskRecord } from "@/lib/store/types";
import { ComputerError, readComputerFile } from "./computer";
import type { RunTarget } from "@/lib/agent/types";
import type { ComputerConfig } from "./computer";
import { computerFor } from "./connection";
import { remoteComputerId, targetComputerConfig } from "./remote";

const MIME: Record<string, string> = {
  md: "text/markdown", markdown: "text/markdown", txt: "text/plain", log: "text/plain", html: "text/html", htm: "text/html",
  css: "text/css", csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json", jsonl: "application/x-ndjson",
  xml: "application/xml", yaml: "text/yaml", yml: "text/yaml", toml: "text/plain", ini: "text/plain", sh: "text/x-shellscript",
  js: "text/javascript", mjs: "text/javascript", jsx: "text/javascript", ts: "text/typescript", tsx: "text/typescript",
  py: "text/x-python", rb: "text/x-ruby", go: "text/x-go", rs: "text/x-rust", java: "text/x-java", c: "text/x-c", cpp: "text/x-c++",
  h: "text/x-c", sql: "application/sql", tex: "text/x-tex", ipynb: "application/x-ipynb+json",
  pdf: "application/pdf", zip: "application/zip", gz: "application/gzip", tar: "application/x-tar",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
  bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
};

export function mimeFor(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? undefined : MIME[name.slice(dot + 1).toLowerCase()];
}

/** The same path always gets the same id, so a file written twice is still one file to the UI. */
export function fileIdFor(filePath: string): string {
  return `file_${createHash("sha1").update(filePath).digest("hex").slice(0, 16)}`;
}

export function fileNameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? "";
}

const FILE_ID = /^[A-Za-z0-9_-]{1,120}$/;
export function isValidFileId(id: string): boolean {
  return FILE_ID.test(id);
}

export interface TaskFile {
  fileId: string;
  name: string;
  mime?: string;
  size?: number;
  /** When the file was first announced. */
  at?: string;
}

function publicFile(file: StoredFile | TaskFile): TaskFile {
  const mime = file.mime ?? mimeFor(file.name);
  return { fileId: file.fileId, name: file.name, ...(mime ? { mime } : {}), ...(file.size !== undefined ? { size: file.size } : {}), ...(file.at ? { at: file.at } : {}) };
}

/** What is needed to answer for a task's files: its record, and its events for tasks older than the record. */
export interface FileSource {
  task: TaskRecord;
  /** Whose computer the files are on (the store's owner). */
  ownerId?: string;
  events: () => Promise<AgentEvent[]>;
}

/**
 * Every file of a task with where it lives. The task's own record is the source; tasks created
 * before that record existed are read from their events, where the path is the preview of the
 * `write_file` call the file id was named after.
 */
async function resolveFiles(source: FileSource, wanted?: string): Promise<StoredFile[]> {
  const files = new Map<string, StoredFile>(Object.values(source.task.meta?.files ?? {}).map((f) => [f.fileId, f]));
  // The events are only read when they can add something: a full listing, or an id the record does not know.
  if (wanted !== undefined && files.has(wanted)) return [...files.values()];
  let events: AgentEvent[] = [];
  try {
    events = await source.events();
  } catch {
    // The record alone is still a complete answer for tasks that have one.
  }
  const previews = new Map<string, string>();
  for (const event of events) {
    if (event.type === "tool.started" && event.preview) previews.set(event.callId, event.preview.trim());
    if (event.type !== "file.created" || files.has(event.fileId)) continue;
    const from = previews.get(event.fileId.replace(/^file_/, ""));
    files.set(event.fileId, {
      fileId: event.fileId,
      path: from && from.startsWith("/") ? from : "",
      name: event.name,
      mime: event.mime,
      size: event.size,
      version: "legacy",
      at: event.at,
    });
  }
  return [...files.values()];
}

export async function listTaskFiles(source: FileSource): Promise<TaskFile[]> {
  return (await resolveFiles(source)).map(publicFile);
}

// ---------------------------------------------------------------------- cache

function cacheDir(taskId: string): string {
  if (!isValidTaskId(taskId)) throw new Error(`Invalid task id: ${taskId}`);
  return path.join(process.env.OPENMAN_DATA_DIR || path.join(process.cwd(), ".data"), "files", taskId);
}

interface CacheEntry {
  version: string;
  size: number;
  fetchedAt: string;
}

async function readCache(taskId: string, fileId: string): Promise<{ entry: CacheEntry; bytes: Buffer } | null> {
  const dir = cacheDir(taskId);
  try {
    const entry = JSON.parse(await fs.readFile(path.join(dir, `${fileId}.json`), "utf8")) as CacheEntry;
    return { entry, bytes: await fs.readFile(path.join(dir, fileId)) };
  } catch {
    return null;
  }
}

async function writeCache(taskId: string, fileId: string, version: string, bytes: Buffer): Promise<void> {
  const dir = cacheDir(taskId);
  await fs.mkdir(dir, { recursive: true });
  // Bytes first, then the note that describes them, each through a rename so a reader never sees half a file.
  const tmp = path.join(dir, `.${fileId}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, path.join(dir, fileId));
  const entry: CacheEntry = { version, size: bytes.length, fetchedAt: new Date().toISOString() };
  await fs.writeFile(`${tmp}.json`, JSON.stringify(entry), "utf8");
  await fs.rename(`${tmp}.json`, path.join(dir, `${fileId}.json`));
}

/** The cached copy of a task's file (any version), or null. Used to restore files after the idle sweep. */
export async function cachedFile(taskId: string, file: StoredFile): Promise<Buffer | null> {
  return (await readCache(taskId, file.fileId))?.bytes ?? null;
}

/** True when the cache holds the file's current version. */
export async function isCached(taskId: string, file: StoredFile): Promise<boolean> {
  return (await readCache(taskId, file.fileId))?.entry.version === file.version;
}

/** Makes sure the cache holds the file's current version (reading it from the computer when needed). */
export async function ensureCached(taskId: string, file: StoredFile, ownerId: string | undefined, target?: RunTarget): Promise<boolean> {
  if (await isCached(taskId, file)) return true;
  if (!file.path) return false;
  return loadBytes(taskId, file, ownerId, target).then(
    () => true,
    () => false,
  );
}

const g = globalThis as typeof globalThis & { __openmanFileFetches?: Map<string, Promise<Buffer>> };
const inFlight = (g.__openmanFileFetches ??= new Map());

/** The file's bytes: the cached copy when it matches the current version, a fresh read otherwise. */
/** The computer a task's files are on: the one it was given, else the home computer. */
async function computerForTask(ownerId: string | undefined, target: RunTarget | undefined): Promise<ComputerConfig | null> {
  const remote = remoteComputerId(target);
  if (remote && ownerId) return targetComputerConfig(ownerId, remote).catch(() => null);
  return computerFor(ownerId);
}

async function loadBytes(taskId: string, file: StoredFile, ownerId: string | undefined, target?: RunTarget): Promise<Buffer> {
  const cached = await readCache(taskId, file.fileId);
  if (cached && cached.entry.version === file.version) return cached.bytes;
  const cfg = await computerForTask(ownerId, target);
  if (!cfg || !file.path) {
    if (cached) return cached.bytes;
    throw new ComputerError("This file is not available.", 404);
  }
  const key = `${taskId}/${file.fileId}/${file.version}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const bytes = await readComputerFile(cfg, file.path);
      await writeCache(taskId, file.fileId, file.version, bytes).catch((err) => console.warn(`[files] could not cache ${file.fileId}:`, err instanceof Error ? err.message : err));
      return bytes;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  try {
    return await pending;
  } catch (err) {
    // The computer is unreachable or the file is gone: an older copy is better than nothing.
    if (cached) return cached.bytes;
    throw err;
  }
}

export interface FileContent {
  file: TaskFile;
  bytes: Buffer;
}

/** One file of a task with its content, or null when the task has no such file. */
export async function readTaskFile(source: FileSource, fileId: string): Promise<FileContent | null> {
  if (!isValidFileId(fileId)) return null;
  const file = (await resolveFiles(source, fileId)).find((f) => f.fileId === fileId);
  if (!file) return null;
  const bytes = await loadBytes(source.task.id, file, source.ownerId, source.task.meta.target);
  return { file: { ...publicFile(file), size: bytes.length }, bytes };
}

/** Copies a task's files to the cache in the background, so they outlive later changes on the computer. */
export function prefetchFiles(taskId: string, files: StoredFile[], ownerId?: string, target?: RunTarget): void {
  if (!remoteComputerId(target) && !computerFor(ownerId)) return;
  void (async () => {
    for (const file of files) {
      if (!file.path || (file.size ?? 0) > 25 * 1024 * 1024) continue;
      await loadBytes(taskId, file, ownerId, target).catch(() => undefined);
    }
  })();
}
