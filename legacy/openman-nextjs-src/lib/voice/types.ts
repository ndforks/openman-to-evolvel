// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Voice types shared by the browser and the server. No imports, safe on both sides. */

/** Which engine turns speech into text, for each job. Picked on the server by whether `ELEVENLABS_API_KEY` is set. */
export interface VoiceConfig {
  /** Live dictation and the live meeting transcript: ElevenLabs Scribe realtime, or the browser's own speech recognition. */
  live: "elevenlabs" | "browser";
  /** Transcribing a whole recording or file: ElevenLabs Scribe batch, or Whisper on the user's own computer. */
  transcription: "elevenlabs" | "computer";
  /** True only when the transcription engine labels speakers (ElevenLabs). The UI must not claim speaker detection otherwise. */
  speakers: boolean;
  /** Bytes per upload part. Every part is one request; no file goes through a single huge request. */
  partSize: number;
  /** Largest file accepted, in bytes. */
  maxBytes: number;
}

export interface TranscriptSegment {
  /** Seconds from the start. */
  start: number;
  end: number;
  text: string;
  /** Speaker label from the engine ("speaker_0"), only when the engine diarizes. */
  speaker?: string;
}

export interface Transcript {
  text: string;
  language: string | null;
  /** Seconds of audio. */
  duration: number;
  segments: TranscriptSegment[];
  /** Whether `segments[].speaker` comes from real speaker detection. */
  speakers: boolean;
  /** "elevenlabs:scribe_v2" or "computer:whisper-base". */
  provider: string;
  /** Seconds the engine took. */
  seconds?: number;
}

export type MeetingStatus = "uploading" | "transcribing" | "summarizing" | "done" | "error";

/** A recording or uploaded file on its way to a notes task, as the API returns it. */
export interface MeetingView {
  id: string;
  title: string;
  source: "recording" | "upload";
  status: MeetingStatus;
  fileName: string;
  sizeBytes: number;
  partSize: number;
  partsTotal: number;
  partsDone: number[];
  provider: string | null;
  speakers: boolean;
  /** While transcribing: seconds of audio done out of the total, when the engine reports it. */
  progress: { state: string; done: number; total: number } | null;
  taskId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `[mm:ss]` or `[h:mm:ss]`. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
