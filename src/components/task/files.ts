"use client";

/**
 * Files a task delivered, read from the server:
 *   GET /api/tasks/<id>/files            the list
 *   GET /api/tasks/<id>/files/<fileId>   one file's bytes (`?download=1` forces a download)
 *
 * Both are optional as far as the screen is concerned. When a route answers 404 (an older backend, or a
 * file that is gone) the callers fall back to what the event stream carries: the file's name and size,
 * and whatever text the work log happens to hold.
 */
import { useEffect, useState } from "react";
import type { TaskFile } from "./reducer";

export function fileUrl(taskId: string, fileId: string, download = false): string {
  return `/api/tasks/${encodeURIComponent(taskId)}/files/${encodeURIComponent(fileId)}${download ? "?download=1" : ""}`;
}

const extension = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);
const TEXT_EXT = new Set(["md", "mdx", "txt", "csv", "tsv", "json", "jsonl", "yaml", "yml", "toml", "xml", "html", "htm", "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "sh", "bash", "go", "rs", "java", "c", "h", "cpp", "sql", "log", "ini", "env", "rb", "php", "swift", "kt", "lua", "r", "tex", "srt", "vtt"]);

export const isMarkdownFile = (file: Pick<TaskFile, "name" | "mime">) => /\.(md|mdx|markdown)$/i.test(file.name) || file.mime === "text/markdown";
export const isImageFile = (file: Pick<TaskFile, "name" | "mime">) => /^image\//.test(file.mime ?? "") || IMAGE_EXT.has(extension(file.name));
const isPdfFile = (file: Pick<TaskFile, "name" | "mime">) => file.mime === "application/pdf" || extension(file.name) === "pdf";
function isTextFile(file: Pick<TaskFile, "name" | "mime">, served: string): boolean {
  const mime = `${file.mime ?? ""} ${served}`;
  return /text\/|json|xml|javascript|typescript|yaml|csv|markdown|x-sh|x-python/.test(mime) || TEXT_EXT.has(extension(file.name));
}

/* ---------------------------------------------------------------- list */

type Loose = Record<string, unknown>;
const isRecord = (value: unknown): value is Loose => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

/** Accepts `{ files: [...] }` or a bare array, and the common spellings of each field. */
function parseList(json: unknown): TaskFile[] | null {
  const list = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.files) ? json.files : null;
  if (!list) return null;
  const files: TaskFile[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const fileId = str(item.fileId) ?? str(item.id);
    const name = str(item.name) ?? str(item.path)?.split("/").pop();
    if (!fileId || !name) continue;
    files.push({
      fileId,
      name,
      mime: str(item.mime) ?? str(item.contentType) ?? str(item.type),
      size: typeof item.size === "number" ? item.size : undefined,
      at: str(item.at) ?? str(item.createdAt) ?? str(item.modifiedAt) ?? str(item.updatedAt) ?? "",
    });
  }
  return files;
}

/**
 * The server's list of files for a task, refetched whenever `version` changes (a file event arrived, a run ended).
 * `null` until it has loaded, and for good when the route is missing.
 */
export function useServerFiles(taskId: string, enabled: boolean, version: string | number): TaskFile[] | null {
  const [files, setFiles] = useState<TaskFile[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/tasks/${encodeURIComponent(taskId)}/files`, { headers: { accept: "application/json" } })
      .then(async (res) => (res.ok && /json/.test(res.headers.get("content-type") ?? "") ? parseList(await res.json()) : null))
      .then((next) => {
        if (!cancelled && next) setFiles(next);
      })
      .catch(() => {
        // No list: the files named in the event stream are shown on their own.
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, enabled, version]);
  return files;
}

/** Files from the event stream first (they carry the order of delivery), then anything only the server lists. */
export function mergeFiles(fromEvents: TaskFile[], fromServer: TaskFile[] | null): TaskFile[] {
  if (!fromServer || fromServer.length === 0) return fromEvents;
  const byId = new Map(fromServer.map((file) => [file.fileId, file]));
  const seen = new Set<string>();
  const merged = fromEvents.map((file) => {
    seen.add(file.fileId);
    const server = byId.get(file.fileId);
    return server ? { ...file, mime: file.mime ?? server.mime, size: server.size ?? file.size } : file;
  });
  const names = new Set(merged.map((file) => file.name));
  for (const file of fromServer) if (!seen.has(file.fileId) && !names.has(file.name)) merged.push(file);
  return merged;
}

/* ---------------------------------------------------------------- content */

export type FileContent =
  | { state: "loading" }
  /** The file's text (possibly only its first part). */
  | { state: "text"; text: string; truncated: boolean }
  /** An object URL for an image. */
  | { state: "image"; url: string }
  /** An object URL the browser can show in a frame (PDF). */
  | { state: "embed"; url: string }
  /** The file exists but has no inline preview. */
  | { state: "binary" }
  /** The file route is not there, or the file is gone. */
  | { state: "missing" };

const MAX_TEXT = 400_000;
const cache = new Map<string, FileContent>();
const inFlight = new Map<string, Promise<FileContent>>();

function decodeEnvelope(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const content = str(json.content) ?? str(json.text) ?? str(json.data);
  if (content === undefined) return null;
  if (json.encoding !== "base64") return content;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function load(taskId: string, file: TaskFile): Promise<FileContent> {
  let res: Response;
  try {
    res = await fetch(fileUrl(taskId, file.fileId));
  } catch {
    return { state: "missing" };
  }
  if (!res.ok) return { state: "missing" };
  const served = (res.headers.get("content-type") ?? "").toLowerCase();
  // An HTML answer for something that is not an HTML file is an error page, not the file.
  if (/text\/html/.test(served) && !/\.html?$/i.test(file.name)) return { state: "missing" };
  if (isImageFile(file) || /^image\//.test(served)) return { state: "image", url: URL.createObjectURL(await res.blob()) };
  if (isPdfFile(file) || /application\/pdf/.test(served)) return { state: "embed", url: URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: "application/pdf" })) };
  // Some backends wrap the text as `{ "content": "..." }`.
  if (/application\/json/.test(served) && extension(file.name) !== "json") {
    const raw = await res.text();
    try {
      const inner = decodeEnvelope(JSON.parse(raw));
      if (inner !== null) return { state: "text", text: inner.slice(0, MAX_TEXT), truncated: inner.length > MAX_TEXT };
    } catch {
      // Plain text that merely claims to be JSON.
    }
    return { state: "text", text: raw.slice(0, MAX_TEXT), truncated: raw.length > MAX_TEXT };
  }
  if (!isTextFile(file, served)) return { state: "binary" };
  const body = await res.text();
  return { state: "text", text: body.slice(0, MAX_TEXT), truncated: body.length > MAX_TEXT };
}

/** What can be shown of a file. Loaded once per file version and shared by every place that shows it. */
export function useFileContent(taskId: string | null, file: TaskFile | null): FileContent {
  const key = taskId && file ? `${taskId}:${file.fileId}:${file.size ?? ""}` : null;
  const [loaded, setLoaded] = useState<{ key: string; content: FileContent } | null>(null);

  useEffect(() => {
    if (!key || !taskId || !file || cache.has(key)) return;
    let cancelled = false;
    let request = inFlight.get(key);
    if (!request) {
      request = load(taskId, file).finally(() => inFlight.delete(key));
      inFlight.set(key, request);
    }
    void request.then((content) => {
      // A missing file is asked for again next time: the route may simply not be deployed yet.
      if (content.state !== "missing") cache.set(key, content);
      if (!cancelled) setLoaded({ key, content });
    });
    return () => {
      cancelled = true;
    };
    // `file` is identified by `key`; a new object for the same file must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, taskId]);

  if (!key) return { state: "missing" };
  return cache.get(key) ?? (loaded && loaded.key === key ? loaded.content : { state: "loading" });
}
