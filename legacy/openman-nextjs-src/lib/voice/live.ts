// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Live speech-to-text in the browser, behind one interface, for dictation and the live meeting transcript.
 *
 * - "elevenlabs": Scribe realtime over a WebSocket opened straight from the browser with a single-use token from
 *   `POST /api/voice/token` (the key never reaches the browser). Microphone audio is resampled to 16 kHz PCM
 *   and sent as `input_audio_chunk` messages; `partial_transcript` / `committed_transcript` come back.
 *   A dropped socket reconnects with a fresh token (the recording itself never depends on it).
 * - "browser": the browser's own speech recognition (Chrome, Edge, Safari), restarted when it stops by itself.
 *
 * Plus `meter()`, a microphone level for the waveform, which works with either engine.
 */
import type { VoiceConfig } from "./types";

export type LiveEngine = VoiceConfig["live"];

export interface LiveCallbacks {
  /** Interim text for the phrase being spoken; replaced on every call. */
  onPartial(text: string): void;
  /** A finished phrase. */
  onFinal(text: string): void;
  /** `fatal` ends the session (permission refused, unsupported); otherwise the engine is retrying. */
  onError(message: string, fatal: boolean): void;
  /** "live" while text can arrive, "paused" while reconnecting or offline. */
  onState?(state: "live" | "paused"): void;
}

export interface LiveOptions {
  /** Microphone stream (required for ElevenLabs; the browser engine captures on its own). */
  stream?: MediaStream | null;
  language?: string;
  keyterms?: string[];
  /** Keep going across silences and network drops (meetings). Dictation stops on errors instead. */
  persistent?: boolean;
}

export interface LiveSession {
  /** Stops listening and resolves once the last phrase has been delivered (or after a short wait). */
  stop(): Promise<void>;
  /** Stops at once and drops anything pending. */
  cancel(): void;
}

/* ------------------------------------------------------------------ browser engine */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult extends ArrayLike<RecognitionAlternative> {
  isFinal: boolean;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

export function browserRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function liveSupported(engine: LiveEngine): boolean {
  if (typeof window === "undefined") return false;
  if (engine === "elevenlabs") return !!navigator.mediaDevices?.getUserMedia && typeof WebSocket !== "undefined" && typeof AudioContext !== "undefined";
  return browserRecognition() !== null;
}

function startBrowser(opts: LiveOptions, cb: LiveCallbacks): LiveSession {
  const Recognizer = browserRecognition();
  if (!Recognizer) throw new Error("Voice input is not available in this browser.");
  let stopped = false;
  let cancelled = false;
  let current: Recognition | null = null;
  let endWaiter: (() => void) | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const run = () => {
    if (stopped) return;
    const r = new Recognizer();
    r.lang = opts.language || navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      if (cancelled) return;
      failures = 0;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          if (text.trim()) cb.onFinal(text.trim());
        } else interim += text;
      }
      cb.onPartial(interim.trim());
    };
    r.onerror = (event) => {
      const code = event?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        stopped = true;
        cb.onError("Microphone access is blocked. Allow it in the browser's site settings.", true);
      } else if (code === "audio-capture") {
        stopped = true;
        cb.onError("No microphone was found.", true);
      } else if (code === "network") {
        cb.onError("Live transcript paused: no connection.", !opts.persistent);
        if (!opts.persistent) stopped = true;
      } else if (code && code !== "no-speech" && code !== "aborted") {
        failures += 1;
        if (!opts.persistent && failures > 2) {
          stopped = true;
          cb.onError("Voice input stopped.", true);
        }
      }
    };
    r.onend = () => {
      current = null;
      if (endWaiter) {
        endWaiter();
        endWaiter = null;
      }
      if (stopped) return;
      // Chrome ends a session after a silence or about a minute: start a new one.
      cb.onState?.("paused");
      const wait = navigator.onLine === false ? 3000 : Math.min(250 * 2 ** Math.min(failures, 4), 4000);
      restartTimer = setTimeout(run, wait);
    };
    try {
      r.start();
      current = r;
      cb.onState?.("live");
    } catch {
      restartTimer = setTimeout(run, 1000);
    }
  };
  run();

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        stopped = true;
        if (restartTimer) clearTimeout(restartTimer);
        if (!current) return resolve();
        const timer = setTimeout(resolve, 1500);
        endWaiter = () => {
          clearTimeout(timer);
          resolve();
        };
        try {
          current.stop();
        } catch {
          resolve();
        }
      }),
    cancel: () => {
      stopped = true;
      cancelled = true;
      if (restartTimer) clearTimeout(restartTimer);
      try {
        current?.abort();
      } catch {
        // Already ended.
      }
    },
  };
}

/* ------------------------------------------------------------------ ElevenLabs engine */

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Float32 at `from` Hz -> 16-bit PCM at 16 kHz (linear resampling is fine for speech). */
function to16k(input: Float32Array, from: number): Uint8Array {
  const ratio = from / 16000;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const v = input[i0] + (input[i1] - input[i0]) * (pos - i0);
    out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  return new Uint8Array(out.buffer);
}

async function fetchToken(maxSessionSeconds?: number): Promise<{ token: string; url: string; modelId: string }> {
  const res = await fetch("/api/voice/token", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ maxSessionSeconds }) });
  const body = (await res.json().catch(() => null)) as { token?: string; url?: string; modelId?: string; error?: string } | null;
  if (!res.ok || !body?.token || !body.url) throw new Error(body?.error || "Live transcription is unavailable.");
  return { token: body.token, url: body.url, modelId: body.modelId ?? "scribe_v2_realtime" };
}

function startElevenLabs(opts: LiveOptions, cb: LiveCallbacks): LiveSession {
  const stream = opts.stream;
  if (!stream) throw new Error("No microphone stream.");
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universal and needs no extra module file; 4096 frames is ~85 ms at 48 kHz.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);

  let ws: WebSocket | null = null;
  let stopped = false;
  let cancelled = false;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let commitWaiter: (() => void) | null = null;

  proc.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pcm = to16k(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: toBase64(pcm), commit: false, sample_rate: 16000 }));
  };

  const connect = async () => {
    if (stopped) return;
    try {
      const { token, url, modelId } = await fetchToken(opts.persistent ? 4 * 3600 : 15 * 60);
      if (stopped) return;
      const qs = new URLSearchParams({ model_id: modelId, token, audio_format: "pcm_16000", commit_strategy: "vad" });
      if (opts.language) qs.set("language_code", opts.language.split("-")[0]);
      for (const term of (opts.keyterms ?? []).slice(0, 50)) qs.append("keyterms", term);
      const socket = new WebSocket(`${url}?${qs.toString()}`);
      ws = socket;
      socket.onopen = () => {
        attempts = 0;
        cb.onState?.("live");
      };
      socket.onmessage = (ev) => {
        if (cancelled) return;
        let msg: { message_type?: string; text?: string; error?: string };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.message_type === "partial_transcript") cb.onPartial(msg.text ?? "");
        else if (msg.message_type === "committed_transcript" || msg.message_type === "committed_transcript_with_timestamps") {
          if (msg.message_type === "committed_transcript" && msg.text?.trim()) cb.onFinal(msg.text.trim());
          cb.onPartial("");
          if (commitWaiter) {
            commitWaiter();
            commitWaiter = null;
          }
        } else if (msg.message_type && msg.message_type !== "session_started" && (msg.message_type.endsWith("error") || msg.error)) {
          const fatal = msg.message_type === "auth_error" || msg.message_type === "quota_exceeded" || msg.message_type === "unaccepted_terms";
          cb.onError(msg.error || "Live transcription error.", fatal && !opts.persistent);
        }
      };
      socket.onclose = () => {
        if (ws === socket) ws = null;
        if (commitWaiter) {
          commitWaiter();
          commitWaiter = null;
        }
        if (stopped) return;
        cb.onState?.("paused");
        if (!opts.persistent && attempts >= 2) {
          cb.onError("Live transcription disconnected.", true);
          return;
        }
        attempts += 1;
        reconnectTimer = setTimeout(() => void connect(), Math.min(1000 * 2 ** Math.min(attempts, 5), 30_000));
      };
    } catch (err) {
      if (stopped) return;
      cb.onState?.("paused");
      attempts += 1;
      if (!opts.persistent && attempts >= 2) {
        cb.onError(err instanceof Error ? err.message : "Live transcription is unavailable.", true);
        return;
      }
      reconnectTimer = setTimeout(() => void connect(), Math.min(1000 * 2 ** Math.min(attempts, 5), 30_000));
    }
  };
  void connect();

  const teardown = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    proc.onaudioprocess = null;
    try {
      source.disconnect();
      proc.disconnect();
      mute.disconnect();
    } catch {
      // Already disconnected.
    }
    void ctx.close().catch(() => undefined);
    try {
      ws?.close();
    } catch {
      // Already closed.
    }
    ws = null;
  };

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        stopped = true;
        const socket = ws;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          teardown();
          return resolve();
        }
        // Commit what was said since the last pause and wait for its text.
        const timer = setTimeout(() => {
          teardown();
          resolve();
        }, 3000);
        commitWaiter = () => {
          clearTimeout(timer);
          teardown();
          resolve();
        };
        const silence = new Uint8Array(3200); // 100 ms of 16 kHz silence carrying the commit
        socket.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: toBase64(silence), commit: true, sample_rate: 16000 }));
      }),
    cancel: () => {
      stopped = true;
      cancelled = true;
      teardown();
    },
  };
}

export function startLive(engine: LiveEngine, opts: LiveOptions, cb: LiveCallbacks): LiveSession {
  return engine === "elevenlabs" ? startElevenLabs(opts, cb) : startBrowser(opts, cb);
}

/* ------------------------------------------------------------------ level meter */

/** Calls `onLevel(0..1)` about 20 times a second with the microphone's loudness. Returns a stop function. */
export function meter(stream: MediaStream, onLevel: (level: number) => void): () => void {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let raf = 0;
  let last = 0;
  const sample = () => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    const rms = Math.sqrt(sum / data.length);
    onLevel(Math.min(1, Math.pow(rms * 4, 0.7)));
  };
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    if (t - last < 50) return;
    last = t;
    sample();
  };
  raf = requestAnimationFrame(tick);
  // Background tabs pause animation frames; keep the meter going with a slow timer there.
  const interval = setInterval(() => {
    if (document.visibilityState === "hidden") sample();
  }, 500);
  return () => {
    cancelAnimationFrame(raf);
    clearInterval(interval);
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
    void ctx.close().catch(() => undefined);
  };
}

/** A friendly sentence for a `getUserMedia` failure. */
export function micError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow it in the browser's site settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found.";
  if (name === "NotReadableError") return "The microphone is in use by another app.";
  return "The microphone could not be opened.";
}
