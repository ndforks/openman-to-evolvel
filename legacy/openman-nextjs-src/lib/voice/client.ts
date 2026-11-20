// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Browser side of `/api/voice`: the engine config (cached per page), the resumable uploader and job polling.
 */
import type { MeetingView, VoiceConfig } from "./types";

export type ClientVoiceConfig = VoiceConfig & { dictionary: string[] };

const FALLBACK: ClientVoiceConfig = { live: "browser", transcription: "computer", speakers: false, partSize: 4 * 1024 * 1024, maxBytes: 2 * 1024 * 1024 * 1024, dictionary: [] };
let configPromise: Promise<ClientVoiceConfig> | null = null;
let configValue: ClientVoiceConfig | null = null;

export function voiceConfigNow(): ClientVoiceConfig {
  return configValue ?? FALLBACK;
}

export function loadVoiceConfig(): Promise<ClientVoiceConfig> {
  configPromise ??= fetch("/api/voice/config", { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      configValue = { ...FALLBACK, ...((await res.json()) as Partial<ClientVoiceConfig>) };
      return configValue;
    })
    .catch(() => {
      configPromise = null; // try again next time
      return FALLBACK;
    });
  return configPromise;
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status}).`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export function beginUpload(input: { source: "recording" | "upload"; fileName: string; mime: string | null; sizeBytes: number; title?: string }): Promise<{ meeting: MeetingView }> {
  return api("/api/voice/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export function getUpload(id: string): Promise<{ meeting: MeetingView }> {
  return api(`/api/voice/uploads/${id}`);
}

export function listUploads(): Promise<{ meetings: MeetingView[] }> {
  return api("/api/voice/uploads");
}

export function startJob(meetingId: string, retry = false): Promise<{ meeting: MeetingView }> {
  return api("/api/voice/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId, retry }) });
}

export function pollJob(meetingId: string): Promise<{ meeting: MeetingView }> {
  return api(`/api/voice/jobs/${meetingId}`);
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

function waitOnline(signal?: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      window.removeEventListener("online", done);
      resolve();
    };
    window.addEventListener("online", done);
    signal?.addEventListener("abort", () => {
      window.removeEventListener("online", done);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

/**
 * Sends every part of `blob` that the server does not have yet, one request per part, retrying each with
 * backoff and waiting out offline periods. Resumes from `meeting.partsDone`.
 */
export async function uploadParts(meeting: MeetingView, blob: Blob, onProgress: (sent: number, total: number) => void, signal?: AbortSignal): Promise<MeetingView> {
  let current = meeting;
  const have = new Set(meeting.partsDone);
  const partBytes = (i: number) => Math.min(meeting.partSize, meeting.sizeBytes - i * meeting.partSize);
  let sent = [...have].reduce((n, i) => n + partBytes(i), 0);
  onProgress(sent, meeting.sizeBytes);
  for (let i = 0; i < meeting.partsTotal; i += 1) {
    if (have.has(i)) continue;
    const part = blob.slice(i * meeting.partSize, i * meeting.partSize + partBytes(i));
    for (let attempt = 0; ; attempt += 1) {
      await waitOnline(signal);
      try {
        const res = await api<{ meeting: MeetingView }>(`/api/voice/uploads/${meeting.id}/parts/${i}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: part, signal });
        current = res.meeting;
        break;
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        const status = (err as { status?: number }).status ?? 0;
        if ((status >= 400 && status < 500 && status !== 408 && status !== 429) || attempt >= 7) throw err;
        await sleep(Math.min(1000 * 2 ** attempt, 20_000), signal);
      }
    }
    sent += partBytes(i);
    onProgress(sent, meeting.sizeBytes);
  }
  return current;
}

/** Polls the transcription until it is done (a task exists) or failed. */
export async function waitForNotes(meetingId: string, onUpdate: (m: MeetingView) => void, signal?: AbortSignal): Promise<MeetingView> {
  for (let failures = 0; ; ) {
    try {
      const { meeting } = await pollJob(meetingId);
      failures = 0;
      onUpdate(meeting);
      if (meeting.status === "done" || meeting.status === "error") return meeting;
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      failures += 1;
      if (failures > 20) throw err;
    }
    await sleep(3000, signal);
  }
}
