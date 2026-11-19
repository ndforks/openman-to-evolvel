/** Browser helpers for `/api/recordings`. */
import type { ComputerView } from "@/lib/agent/types";
import type { RecordedStep, Recording, RecordingWithSkill } from "./types";

export class RecordingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new RecordingApiError(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`, res.status, typeof json.code === "string" ? json.code : undefined, json);
  return json as T;
}

export const recordingsApi = {
  computer: () => call<{ computerId: string; status: string; view: ComputerView }>("GET", "/api/recordings/computer"),
  list: (open = false) => call<{ recordings: Recording[] }>("GET", `/api/recordings${open ? "?open=1" : ""}`),
  create: (name: string, screenW?: number, screenH?: number) => call<{ recording: Recording }>("POST", "/api/recordings", { name, screenW, screenH }),
  get: (id: string) => call<RecordingWithSkill>("GET", `/api/recordings/${id}`),
  patch: (id: string, patch: { name?: string; description?: string; steps?: { id: string; note?: string }[] }) => call<{ recording: Recording }>("PATCH", `/api/recordings/${id}`, patch),
  remove: (id: string) => call<{ ok: true }>("DELETE", `/api/recordings/${id}`),
  events: (id: string, seq: number, events: RecordedStep[]) => call<{ ok: true }>("POST", `/api/recordings/${id}/parts`, { kind: "events", seq, events }),
  image: (id: string, img: { key: string; mime: string; width: number; height: number; data: string }) => call<{ ok: true }>("POST", `/api/recordings/${id}/parts`, { kind: "image", ...img }),
  finish: (id: string, screenW?: number, screenH?: number) => call<{ recording: Recording }>("POST", `/api/recordings/${id}/finish`, { screenW, screenH }),
  generate: (id: string, skillName?: string) => call<{ recording: Recording }>("POST", `/api/recordings/${id}/generate`, { skillName }),
  restore: (id: string) => call<{ recording: Recording }>("POST", `/api/recordings/${id}/restore`),
  window: (id: string) => call<{ title: string | null }>("GET", `/api/recordings/${id}/window`),
};

export const imageUrl = (recordingId: string, key: string) => `/api/recordings/${recordingId}/images/${key}`;
