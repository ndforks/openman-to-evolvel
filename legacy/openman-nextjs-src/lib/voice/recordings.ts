// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Meeting audio kept in IndexedDB while it is recorded, so a crash, a reload or a lost connection loses
 * nothing. Each MediaRecorder chunk is written the moment it arrives; the recording is deleted only after
 * its notes task exists.
 */

const DB_NAME = "om-voice";
const VERSION = 1;

export interface SavedRecording {
  id: string;
  title: string;
  mime: string;
  startedAt: number;
  /** Updated with every chunk: the last moment audio was saved. */
  savedAt: number;
  /** "recording" until Finish (or a crash); "finished" once the user pressed Finish. */
  state: "recording" | "finished";
  /** Set once the upload has started, so a reload resumes the same upload. */
  meetingId?: string;
  /** The live transcript shown on screen (not used for notes). */
  liveText?: string;
  chunks: number;
  bytes: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["recordingId", "seq"] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB is unavailable."));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const getDb = () => (dbPromise ??= openDb().catch((err) => {
  dbPromise = null;
  throw err;
}));

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted."));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(rec: SavedRecording): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("recordings", "readwrite");
  tx.objectStore("recordings").put(rec);
  await done(tx);
}

export async function updateRecording(id: string, patch: Partial<SavedRecording>): Promise<SavedRecording | null> {
  const db = await getDb();
  const tx = db.transaction("recordings", "readwrite");
  const store = tx.objectStore("recordings");
  const current = (await request(store.get(id))) as SavedRecording | undefined;
  if (!current) {
    await done(tx);
    return null;
  }
  const next = { ...current, ...patch };
  store.put(next);
  await done(tx);
  return next;
}

/** Appends one chunk and bumps the recording's counters in the same transaction. */
export async function appendChunk(id: string, seq: number, blob: Blob, liveText?: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["recordings", "chunks"], "readwrite");
  tx.objectStore("chunks").put({ recordingId: id, seq, blob });
  const store = tx.objectStore("recordings");
  const current = (await request(store.get(id))) as SavedRecording | undefined;
  if (current) store.put({ ...current, chunks: Math.max(current.chunks, seq + 1), bytes: current.bytes + blob.size, savedAt: Date.now(), ...(liveText !== undefined ? { liveText } : {}) });
  await done(tx);
}

export async function listRecordings(): Promise<SavedRecording[]> {
  const db = await getDb();
  const tx = db.transaction("recordings", "readonly");
  const all = (await request(tx.objectStore("recordings").getAll())) as SavedRecording[];
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

/** The whole recording as one file, chunks in order. */
export async function recordingBlob(rec: SavedRecording): Promise<Blob> {
  const db = await getDb();
  const tx = db.transaction("chunks", "readonly");
  const range = IDBKeyRange.bound([rec.id, 0], [rec.id, Number.MAX_SAFE_INTEGER]);
  const rows = (await request(tx.objectStore("chunks").getAll(range))) as { seq: number; blob: Blob }[];
  rows.sort((a, b) => a.seq - b.seq);
  return new Blob(rows.map((r) => r.blob), { type: rec.mime });
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["recordings", "chunks"], "readwrite");
  tx.objectStore("recordings").delete(id);
  tx.objectStore("chunks").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
  await done(tx);
}

/** Best container the browser can record: Opus in WebM (Chrome, Firefox, Edge) or AAC in MP4 (Safari). */
export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function extensionForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}
