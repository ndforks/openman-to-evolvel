// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Voice input for the composer: press the mic, speak, watch the waveform and timer,
 * then confirm (the transcript is inserted into the prompt; never auto-sent) or cancel.
 *
 * Engine: ElevenLabs Scribe realtime when the server has `ELEVENLABS_API_KEY` (single-use token, see
 * `src/lib/voice/live.ts`), otherwise the browser's own speech recognition. The user's voice input dictionary
 * (Settings > General) is sent as key terms and applied to the final text.
 *
 * Backwards compatible: `useDictation(onText)` still returns `listening` and `toggle()`. `onText` now receives
 * the whole confirmed transcript once, on `stop()` (or a second `toggle()`), instead of phrase by phrase.
 * Render `<DictationBar dictation={dictation} />` from `@/components/voice` while `dictation.listening`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePref } from "@/components/settings/prefs";
import { loadVoiceConfig, voiceConfigNow } from "@/lib/voice/client";
import { applyDictionary, cleanDictionary, DICTIONARY_PREF } from "@/lib/voice/dictionary";
import { liveSupported, meter, micError, startLive, type LiveEngine, type LiveSession } from "@/lib/voice/live";

export type DictationState = "idle" | "starting" | "listening" | "finishing";

/** Number of level samples kept for the waveform (one every 50 ms). */
export const LEVEL_HISTORY = 48;

export interface Dictation {
  /** True from start until the transcript is delivered or cancelled. */
  listening: boolean;
  state: DictationState;
  /** Finished phrases so far (dictionary applied on confirm). */
  text: string;
  /** The phrase being spoken right now. */
  interim: string;
  /** Microphone loudness 0..1, and the recent history for a waveform (oldest first). */
  level: number;
  levels: number[];
  /** Seconds since recording started. */
  elapsed: number;
  /** Last problem, in a sentence for the user; cleared on the next start. */
  error: string | null;
  /** Whether voice input can work in this browser with the current engine. */
  supported: boolean;
  engine: LiveEngine;
  /** Starts listening. Resolves false when it could not (unsupported, permission refused). */
  start: () => Promise<boolean>;
  /** Confirm: stop and deliver the transcript to `onText`. */
  stop: () => Promise<void>;
  /** Cancel: stop and throw the transcript away. */
  cancel: () => void;
  /** Start, or confirm when already listening. False when voice input is not available. */
  toggle: () => boolean;
}

/** `onText` receives the confirmed transcript (non-empty) once per recording. */
export function useDictation(onText: (text: string) => void): Dictation {
  const [state, setState] = useState<DictationState>("idle");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_HISTORY).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<LiveEngine>(() => voiceConfigNow().live);
  const [supported, setSupported] = useState(true);
  const [prefTerms] = usePref<string[]>(DICTIONARY_PREF, []);

  const handler = useRef(onText);
  const finals = useRef<string[]>([]);
  const interimRef = useRef("");
  const session = useRef<LiveSession | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopMeter = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(false);
  const terms = useRef<string[]>([]);

  useEffect(() => {
    handler.current = onText;
  }, [onText]);
  useEffect(() => {
    terms.current = cleanDictionary(prefTerms);
  }, [prefTerms]);

  useEffect(() => {
    let alive = true;
    void loadVoiceConfig().then((cfg) => {
      if (!alive) return;
      setEngine(cfg.live);
      setSupported(liveSupported(cfg.live));
      if (terms.current.length === 0) terms.current = cleanDictionary(cfg.dictionary);
    });
    return () => {
      alive = false;
    };
  }, []);

  const release = useCallback(() => {
    active.current = false;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stopMeter.current?.();
    stopMeter.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    session.current = null;
  }, []);

  useEffect(
    () => () => {
      session.current?.cancel();
      release();
    },
    [release],
  );

  const cancel = useCallback(() => {
    session.current?.cancel();
    release();
    finals.current = [];
    interimRef.current = "";
    setText("");
    setInterim("");
    setState("idle");
  }, [release]);

  const start = useCallback(async (): Promise<boolean> => {
    if (active.current) return true;
    const cfg = voiceConfigNow();
    const eng = cfg.live;
    setEngine(eng);
    if (!liveSupported(eng)) {
      setSupported(false);
      setError("This browser cannot record voice. Chrome, Edge and Safari can.");
      return false;
    }
    active.current = true;
    finals.current = [];
    interimRef.current = "";
    setText("");
    setInterim("");
    setError(null);
    setElapsed(0);
    setLevels(Array(LEVEL_HISTORY).fill(0));
    setState("starting");

    // The microphone: needed for the waveform (both engines) and as the audio source (ElevenLabs).
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      release();
      setState("idle");
      setError(micError(err));
      return false;
    }
    if (!active.current) {
      release(); // cancelled while the permission prompt was open
      return false;
    }
    stopMeter.current = meter(stream.current, (level) => setLevels((prev) => [...prev.slice(1 - LEVEL_HISTORY), level]));
    const began = Date.now();
    timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 250);

    try {
      session.current = startLive(
        eng,
        { stream: stream.current, keyterms: terms.current, persistent: false },
        {
          onPartial: (t) => {
            interimRef.current = t;
            setInterim(t);
          },
          onFinal: (t) => {
            finals.current.push(t);
            interimRef.current = "";
            setText(finals.current.join(" "));
            setInterim("");
          },
          onError: (message, fatal) => {
            setError(message);
            if (fatal) {
              session.current?.cancel();
              release();
              setState("idle");
            }
          },
        },
      );
    } catch (err) {
      release();
      setState("idle");
      setError(err instanceof Error ? err.message : "Voice input could not start.");
      return false;
    }
    setState("listening");
    return true;
  }, [release]);

  const stop = useCallback(async () => {
    if (!active.current && !session.current) return;
    setState("finishing");
    // Stop the meter and timer at once; let the engine deliver the last phrase.
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const live = session.current;
    await live?.stop();
    const pending = interimRef.current.trim();
    const raw = [...finals.current, ...(pending ? [pending] : [])].join(" ").replace(/\s+/g, " ").trim();
    release();
    finals.current = [];
    interimRef.current = "";
    setText("");
    setInterim("");
    setState("idle");
    const final = applyDictionary(raw, terms.current);
    if (final) handler.current(final);
    else setError((e) => e ?? "Nothing was picked up. Try again a little closer to the mic.");
  }, [release]);

  const toggle = useCallback((): boolean => {
    if (active.current) {
      void stop();
      return true;
    }
    const eng = voiceConfigNow().live;
    if (!liveSupported(eng)) {
      setSupported(false);
      return false;
    }
    void start();
    return true;
  }, [start, stop]);

  return {
    listening: state !== "idle",
    state,
    text,
    interim,
    level: levels[levels.length - 1] ?? 0,
    levels,
    elapsed,
    error,
    supported,
    engine,
    start,
    stop,
    cancel,
    toggle,
  };
}
