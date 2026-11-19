// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * "Record a skill": shapes shared by the recorder in the browser, the `/api/recordings` routes and the server.
 * A recording is an ordered list of steps (what the user did on their computer) plus screenshots taken around them.
 */

export type StepKind = "click" | "double_click" | "right_click" | "drag" | "scroll" | "type" | "key" | "paste" | "pause";

export interface RecordedStep {
  /** Stable id within the recording. */
  id: string;
  /** Milliseconds since the recording started. */
  t: number;
  kind: StepKind;
  /** Pointer position as a fraction of the remote screen (0..1). For a drag, where it started. */
  x?: number;
  y?: number;
  /** Drag end, as a fraction of the screen. */
  x2?: number;
  y2?: number;
  /** Typed or pasted text. Empty when `redacted`. */
  text?: string;
  /** The text was typed somewhere that looked like a password prompt, so it was not kept. */
  redacted?: boolean;
  /** A key or chord, e.g. "Enter", "Ctrl+L", "Ctrl+Shift+T". */
  keys?: string;
  /** Repeats of the same key, or clicks merged into one. */
  count?: number;
  /** Scroll amount in wheel notches (positive is down / right). */
  dx?: number;
  dy?: number;
  /** Title of the active window on the computer, when it could be read. */
  window?: string | null;
  /** Screenshot keys (see `/api/recordings/[id]/images/[key]`). */
  before?: string | null;
  after?: string | null;
  /** The user's note, added in review. */
  note?: string;
}

export type RecordingStatus = "recording" | "review" | "processing" | "done" | "failed";

export interface Recording {
  id: string;
  name: string;
  description: string;
  status: RecordingStatus;
  computerId: string | null;
  screenW: number | null;
  screenH: number | null;
  /** The reviewed steps; null while recording. */
  steps: RecordedStep[] | null;
  taskId: string | null;
  skillName: string | null;
  detail: string | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The skill a finished recording produced, as the skills list reports it. */
export interface RecordingSkill {
  name: string;
  description: string;
  dir: string;
}

export interface RecordingWithSkill {
  recording: Recording;
  skill: RecordingSkill | null;
  /** Status of the task that writes the skill, while processing. */
  taskStatus: string | null;
}

/** Recordings that block starting another one until delivered or discarded. */
export const OPEN_STATUSES: RecordingStatus[] = ["recording", "review"];

/** Upper bounds the server enforces. */
export const LIMITS = { steps: 400, eventsPerPart: 200, /** Timeline parts per recording (the database refuses seq >= 5000 too). */ parts: 5000, imageBytes: 900_000, images: 300, name: 80, description: 4000, note: 1000 } as const;

const pct = (v: number | undefined) => (v === undefined ? "?" : `${Math.round(v * 100)}%`);

/** A one-line, human description of a step. Used in review and in the prompt to the agent. */
export function describeStep(step: RecordedStep): string {
  const where = step.x !== undefined ? ` at ${pct(step.x)} across, ${pct(step.y)} down` : "";
  const times = step.count && step.count > 1 ? ` ×${step.count}` : "";
  switch (step.kind) {
    case "click":
      return `Clicked${where}${times}`;
    case "double_click":
      return `Double-clicked${where}`;
    case "right_click":
      return `Right-clicked${where}`;
    case "drag":
      return `Dragged from ${pct(step.x)}, ${pct(step.y)} to ${pct(step.x2)}, ${pct(step.y2)}`;
    case "scroll": {
      const v = step.dy ? `${step.dy > 0 ? "down" : "up"} ${Math.abs(step.dy)}` : "";
      const h = step.dx ? `${step.dx > 0 ? "right" : "left"} ${Math.abs(step.dx)}` : "";
      return `Scrolled ${[v, h].filter(Boolean).join(" and ") || "a little"}${where}`;
    }
    case "type":
      return step.redacted ? "Typed hidden text (not recorded)" : `Typed "${step.text ?? ""}"`;
    case "key":
      return `Pressed ${step.keys ?? "a key"}${times}`;
    case "paste":
      return step.redacted ? "Pasted hidden text (not recorded)" : `Pasted "${(step.text ?? "").slice(0, 200)}"`;
    case "pause":
      return "Capture paused by the user (steps in this gap were not recorded)";
  }
}

/** mm:ss for a millisecond offset. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
