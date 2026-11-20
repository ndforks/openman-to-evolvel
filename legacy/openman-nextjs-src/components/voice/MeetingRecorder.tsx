// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Meeting recording (`/app/meeting`): record an in-person meeting with the
 * microphone, watch a live transcript, press Finish, and get structured notes (key points, attendees, action
 * items) in a new task that stays as context for follow-up work. An audio or video file can be uploaded instead.
 *
 * - No pause button. Audio is written to IndexedDB every 5 s, so a crash or reload loses nothing; a
 *   saved recording is offered again on the next visit. The live transcript needs the network; the recording does not.
 * - Finish uploads the audio to the user's own computer in parts (resumable), transcribes it there (or with
 *   ElevenLabs when configured), then opens the notes task.
 */
import { AudioLines, Circle, FileAudio, LoaderCircle, Mic, RotateCcw, Square, Trash2, Upload, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { taskHref } from "@/components/pages/routes";
import { usePref } from "@/components/settings/prefs";
import { cn } from "@/components/ui/cn";
import { beginUpload, getUpload, listUploads, loadVoiceConfig, startJob, uploadParts, voiceConfigNow, waitForNotes, type ClientVoiceConfig } from "@/lib/voice/client";
import { applyDictionary, cleanDictionary, DICTIONARY_PREF } from "@/lib/voice/dictionary";
import { liveSupported, meter, micError, startLive, type LiveSession } from "@/lib/voice/live";
import { appendChunk, deleteRecording, extensionForMime, listRecordings, pickMime, recordingBlob, saveRecording, updateRecording, type SavedRecording } from "@/lib/voice/recordings";
import { clock, type MeetingView } from "@/lib/voice/types";
import { Waveform } from "./Waveform";

const LEVELS = 64;
const TIMESLICE_MS = 5000;

type Phase = "idle" | "starting" | "recording" | "processing";

interface Processing {
  title: string;
  step: "saving" | "uploading" | "transcribing" | "summarizing" | "done" | "error";
  uploaded: number;
  total: number;
  meeting: MeetingView | null;
  error: string | null;
  /** IndexedDB recording behind this job, when it came from the recorder. */
  recordingId: string | null;
  file: File | null;
}

const PRIMARY =
  "inline-flex h-[40px] cursor-pointer items-center justify-center gap-[8px] rounded-full bg-[var(--om-btn-primary)] px-[18px] text-[14px] font-medium text-[var(--om-icon-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90 disabled:cursor-default disabled:opacity-50";
const SECONDARY =
  "inline-flex h-[40px] cursor-pointer items-center justify-center gap-[8px] rounded-full border border-[var(--om-border)] px-[18px] text-[14px] font-medium text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)] disabled:cursor-default disabled:opacity-50";
const SMALL =
  "inline-flex h-[30px] cursor-pointer items-center gap-[6px] rounded-full px-[12px] text-[13px] text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-text-1)] focus-visible:bg-[var(--om-fill-subtle)]";

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<MeetingView["status"], string> = {
  uploading: "Uploading",
  transcribing: "Transcribing",
  summarizing: "Writing notes",
  done: "Notes ready",
  error: "Failed",
};

export function MeetingRecorder() {
  const router = useRouter();
  const [config, setConfig] = useState<ClientVoiceConfig>(() => voiceConfigNow());
  const [prefTerms] = usePref<string[]>(DICTIONARY_PREF, []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(LEVELS).fill(0));
  const [finals, setFinals] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [liveState, setLiveState] = useState<"live" | "paused" | "off">("off");
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRecording[]>([]);
  const [recent, setRecent] = useState<MeetingView[]>([]);
  const [job, setJob] = useState<Processing | null>(null);
  const [dragging, setDragging] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef<LiveSession | null>(null);
  const stopMeter = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLock = useRef<{ release(): Promise<void> } | null>(null);
  const recId = useRef<string | null>(null);
  const seq = useRef(0);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const finalsRef = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const finishing = useRef(false);

  const terms = cleanDictionary(prefTerms.length ? prefTerms : config.dictionary);

  /* ---------------------------------------------------------------- load */

  const refresh = useCallback(async () => {
    try {
      setSaved((await listRecordings()).filter((r) => r.id !== recId.current));
    } catch {
      setSaved([]);
    }
    try {
      setRecent((await listUploads()).meetings);
    } catch {
      // Signed out or offline: the list stays as it was.
    }
  }, []);

  useEffect(() => {
    void loadVoiceConfig().then(setConfig);
    void refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine !== false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [finals, interim]);

  // Leaving the page while recording: the browser asks first (the audio is safe in IndexedDB either way).
  useEffect(() => {
    if (phase !== "recording" && !(job && job.step === "uploading")) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase, job]);

  const releaseCapture = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stopMeter.current?.();
    stopMeter.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    setLiveState("off");
  }, []);

  useEffect(
    () => () => {
      live.current?.cancel();
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      releaseCapture();
      abort.current?.abort();
    },
    [releaseCapture],
  );

  /* ---------------------------------------------------------------- notes pipeline */

  const process = useCallback(
    async (input: { recording?: SavedRecording; file?: File; title: string }) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const state: Processing = { title: input.title, step: "saving", uploaded: 0, total: input.file?.size ?? input.recording?.bytes ?? 0, meeting: null, error: null, recordingId: input.recording?.id ?? null, file: input.file ?? null };
      const set = (patch: Partial<Processing>) => {
        Object.assign(state, patch);
        setJob({ ...state });
      };
      set({});
      setPhase("processing");
      try {
        const blob = input.file ?? (await recordingBlob(input.recording!));
        if (blob.size === 0) throw new Error("The recording is empty.");
        let meeting: MeetingView | null = null;
        if (input.recording?.meetingId) {
          meeting = (await getUpload(input.recording.meetingId).catch(() => null))?.meeting ?? null;
        }
        if (!meeting) {
          const mime = input.file?.type || input.recording?.mime || "";
          const fileName = input.file?.name ?? `meeting.${extensionForMime(mime)}`;
          meeting = (await beginUpload({ source: input.file ? "upload" : "recording", fileName, mime: mime || null, sizeBytes: blob.size, title: input.title || undefined })).meeting;
          if (input.recording) await updateRecording(input.recording.id, { meetingId: meeting.id, state: "finished" });
        }
        set({ meeting, total: blob.size, title: meeting.title });
        if (meeting.status === "uploading") {
          set({ step: "uploading" });
          meeting = await uploadParts(meeting, blob, (sent, total) => set({ uploaded: sent, total }), controller.signal);
          meeting = (await startJob(meeting.id)).meeting;
        } else if (meeting.status === "error") {
          meeting = (await startJob(meeting.id, true)).meeting;
        }
        set({ meeting, step: meeting.status === "error" ? "error" : "transcribing", error: meeting.error });
        if (meeting.status === "error") throw new Error(meeting.error ?? "The transcription could not start.");
        const final = await waitForNotes(meeting.id, (m) => set({ meeting: m, step: m.status === "summarizing" ? "summarizing" : m.status === "done" ? "done" : m.status === "error" ? "error" : "transcribing" }), controller.signal);
        if (final.status === "error" || !final.taskId) throw new Error(final.error ?? "The notes could not be made.");
        if (input.recording) await deleteRecording(input.recording.id).catch(() => undefined);
        set({ step: "done" });
        router.push(taskHref(final.taskId));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        set({ step: "error", error: err instanceof Error ? err.message : "Something went wrong." });
        void refresh();
      }
    },
    [refresh, router],
  );

  /* ---------------------------------------------------------------- recording */

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording is not available in this browser.");
      return;
    }
    setPhase("starting");
    try {
      // Room audio: keep noise suppression and gain control, which help distant voices.
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      setPhase("idle");
      setError(micError(err));
      return;
    }
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
    } catch {
      releaseCapture();
      setPhase("idle");
      setError("Recording is not available in this browser.");
      return;
    }
    const id = crypto.randomUUID();
    recId.current = id;
    seq.current = 0;
    finalsRef.current = [];
    setFinals([]);
    setInterim("");
    const startedAt = Date.now();
    const defaultTitle = title.trim() || `Meeting ${new Date(startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${new Date(startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    setTitle(defaultTitle);
    try {
      await saveRecording({ id, title: defaultTitle, mime: rec.mimeType || mime || "audio/webm", startedAt, savedAt: startedAt, state: "recording", chunks: 0, bytes: 0 });
    } catch {
      setError("This browser can't save the recording locally (private window?). It will still work while this page stays open.");
    }
    const memory: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const n = seq.current++;
      memory.push(e.data);
      writes.current = writes.current.then(() => appendChunk(id, n, e.data, finalsRef.current.join(" ").slice(-20_000)).catch(() => undefined));
    };
    (rec as MediaRecorder & { memory?: Blob[] }).memory = memory;
    rec.start(TIMESLICE_MS);
    recorder.current = rec;

    stopMeter.current = meter(stream.current, (level) => setLevels((prev) => [...prev.slice(1 - LEVELS), level]));
    setElapsed(0);
    timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    try {
      wakeLock.current = (await (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock.current = null;
    }
    // A microphone that goes away (unplugged, another app took it) ends the recording; what was captured is kept.
    stream.current.getAudioTracks()[0]?.addEventListener("ended", () => void finishRef.current());

    if (liveSupported(config.live)) {
      try {
        live.current = startLive(
          config.live,
          { stream: stream.current, keyterms: terms, persistent: true },
          {
            onPartial: setInterim,
            onFinal: (t) => {
              finalsRef.current = [...finalsRef.current, applyDictionary(t, terms)];
              setFinals(finalsRef.current);
              setInterim("");
            },
            onError: (message, fatal) => {
              if (fatal) setLiveState("off");
              setError(message);
            },
            onState: (s) => {
              setLiveState(s);
              if (s === "live") setError(null);
            },
          },
        );
      } catch {
        setLiveState("off");
      }
    }
    setPhase("recording");
  }, [config.live, releaseCapture, terms, title]);

  const stopCapture = useCallback(async (): Promise<SavedRecording | null> => {
    const rec = recorder.current;
    const id = recId.current;
    recorder.current = null;
    const liveSession = live.current;
    live.current = null;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.addEventListener("stop", () => resolve(), { once: true });
        rec.stop();
      });
    }
    await liveSession?.stop();
    releaseCapture();
    await writes.current;
    if (!id) return null;
    const stored = await updateRecording(id, { state: "finished", title: title.trim() || undefined, liveText: finalsRef.current.join(" ").slice(-20_000) }).catch(() => null);
    if (stored && stored.bytes > 0) return stored;
    // IndexedDB unavailable: fall back to what is in memory.
    const memory = (rec as (MediaRecorder & { memory?: Blob[] }) | null)?.memory ?? [];
    if (memory.length === 0) return null;
    const blob = new Blob(memory, { type: rec?.mimeType || "audio/webm" });
    return { id, title, mime: blob.type, startedAt: Date.now(), savedAt: Date.now(), state: "finished", chunks: memory.length, bytes: blob.size, memoryBlob: blob } as SavedRecording & { memoryBlob: Blob };
  }, [releaseCapture, title]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const rec = await stopCapture();
      recId.current = null;
      if (!rec) {
        setPhase("idle");
        setError("Nothing was recorded.");
        return;
      }
      const memoryBlob = (rec as SavedRecording & { memoryBlob?: Blob }).memoryBlob;
      if (memoryBlob) await process({ file: new File([memoryBlob], `meeting.${extensionForMime(rec.mime)}`, { type: rec.mime }), title: rec.title });
      else await process({ recording: rec, title: rec.title });
    } finally {
      finishing.current = false;
    }
  }, [process, stopCapture]);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const discard = useCallback(async () => {
    if (!window.confirm("Discard this recording? It can't be recovered.")) return;
    const id = recId.current;
    live.current?.cancel();
    live.current = null;
    const rec = recorder.current;
    recorder.current = null;
    if (rec && rec.state !== "inactive") rec.stop();
    releaseCapture();
    await writes.current;
    if (id) await deleteRecording(id).catch(() => undefined);
    recId.current = null;
    setPhase("idle");
    setFinals([]);
    setInterim("");
    setTitle("");
  }, [releaseCapture]);

  /* ---------------------------------------------------------------- files */

  const pickFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setError(null);
      const okType = /^(audio|video)\//.test(file.type) || /\.(webm|ogg|oga|opus|m4a|mp4|m4v|mp3|wav|flac|aac|mov|mkv|avi|wma|amr|3gp)$/i.test(file.name);
      if (!okType) return setError("Choose an audio or video file.");
      if (file.size > config.maxBytes) return setError("Files up to 2 GB can be transcribed.");
      void process({ file, title: file.name.replace(/\.[^.]+$/, "") });
    },
    [config.maxBytes, process],
  );

  /* ---------------------------------------------------------------- render */

  const liveAvailable = liveSupported(config.live);

  if (phase === "processing" && job) {
    const pct = job.total > 0 ? Math.round((job.uploaded / job.total) * 100) : 0;
    const p = job.meeting?.progress;
    const steps: { key: Processing["step"]; label: string; detail?: string }[] = [
      { key: "uploading", label: "Uploading to your computer", detail: job.step === "uploading" ? `${pct}% of ${formatBytes(job.total)}` : undefined },
      {
        key: "transcribing",
        label: config.transcription === "elevenlabs" ? "Transcribing with speaker detection" : "Transcribing on your computer",
        detail: job.step === "transcribing" && p ? (p.total > 0 && p.state === "transcribing" ? `${clock(p.done)} of ${clock(p.total)}` : p.state === "installing" ? "Preparing speech recognition (first time only)" : p.state) : undefined,
      },
      { key: "summarizing", label: "Writing notes" },
    ];
    const order: Processing["step"][] = ["saving", "uploading", "transcribing", "summarizing", "done"];
    const at = order.indexOf(job.step === "error" ? (job.meeting?.status === "uploading" || !job.meeting ? "uploading" : "transcribing") : job.step);
    return (
      <Shell>
        <h1 className="font-serif text-[24px] leading-[32px] text-[var(--om-text-1)]">{job.title || "Meeting"}</h1>
        <ol className="mt-[24px] flex flex-col gap-[14px]" data-testid="meeting-steps">
          {steps.map((s) => {
            const idx = order.indexOf(s.key);
            const state = idx < at ? "done" : idx === at ? (job.step === "error" ? "error" : "active") : "todo";
            return (
              <li key={s.key} className="flex items-start gap-[12px]">
                <span className={cn("mt-[2px] flex size-[20px] shrink-0 items-center justify-center rounded-full text-[11px]", state === "done" ? "bg-[var(--om-btn-primary)] text-[var(--om-icon-inverse)]" : state === "error" ? "bg-[var(--om-danger)] text-white" : "border border-[var(--om-border)] text-[var(--om-text-3)]")}>
                  {state === "done" ? "✓" : state === "active" ? <LoaderCircle size={12} className="animate-spin" /> : state === "error" ? "!" : ""}
                </span>
                <div className="min-w-0">
                  <p className={cn("text-[14px] leading-[20px]", state === "todo" ? "text-[var(--om-text-3)]" : "text-[var(--om-text-1)]")}>{s.label}</p>
                  {s.detail ? <p className="text-[12px] leading-[18px] text-[var(--om-text-2)]">{s.detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
        {job.step === "uploading" ? (
          <div className="mt-[20px] h-[4px] w-full overflow-hidden rounded-full bg-[var(--om-fill)]">
            <div className="h-full rounded-full bg-[var(--om-icon-1)] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {!online ? (
          <p className="mt-[16px] flex items-center gap-[6px] text-[13px] text-[var(--om-text-2)]">
            <WifiOff size={14} /> Offline. The upload continues when the connection is back.
          </p>
        ) : null}
        {job.step === "error" ? (
          <div className="mt-[20px] flex flex-col gap-[12px]">
            <p role="alert" className="text-[13px] leading-[18px] text-[var(--om-danger)]">{job.error}</p>
            <div className="flex flex-wrap gap-[8px]">
              <button
                type="button"
                className={PRIMARY}
                onClick={async () => {
                  const recording = job.recordingId ? (await listRecordings()).find((r) => r.id === job.recordingId) : undefined;
                  if (recording) void process({ recording, title: job.title });
                  else if (job.file) void process({ file: job.file, title: job.title });
                  else if (job.meeting) {
                    setJob({ ...job, step: "transcribing", error: null });
                    const m = (await startJob(job.meeting.id, true).catch(() => null))?.meeting;
                    if (m) void waitForNotes(m.id, (x) => setJob((j) => (j ? { ...j, meeting: x, step: x.status === "done" ? "done" : x.status === "error" ? "error" : x.status === "summarizing" ? "summarizing" : "transcribing", error: x.error } : j))).then((x) => x.taskId && router.push(taskHref(x.taskId)));
                  }
                }}
              >
                <RotateCcw size={15} /> Try again
              </button>
              <button
                type="button"
                className={SECONDARY}
                onClick={() => {
                  setJob(null);
                  setPhase("idle");
                  void refresh();
                }}
              >
                Back
              </button>
            </div>
            {job.recordingId ? <p className="text-[12px] text-[var(--om-text-3)]">The recording is saved in this browser and can be retried later.</p> : null}
          </div>
        ) : (
          <p className="mt-[20px] text-[12px] leading-[18px] text-[var(--om-text-3)]">Once the upload finishes you can close this page; the notes land in your task list.</p>
        )}
      </Shell>
    );
  }

  if (phase === "recording" || phase === "starting") {
    return (
      <Shell wide>
        <div className="flex items-center gap-[10px]">
          <span className="relative flex size-[10px]" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--om-danger)] opacity-60" />
            <span className="relative inline-flex size-[10px] rounded-full bg-[var(--om-danger)]" />
          </span>
          <span className="text-[13px] font-medium text-[var(--om-text-2)]">{phase === "starting" ? "Starting…" : "Recording"}</span>
          {!online ? (
            <span className="ml-[4px] inline-flex items-center gap-[4px] rounded-full bg-[var(--om-fill)] px-[8px] py-[2px] text-[12px] text-[var(--om-text-2)]">
              <WifiOff size={12} /> Offline, still recording
            </span>
          ) : null}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Meeting title"
          maxLength={120}
          className="mt-[12px] w-full border-0 bg-transparent font-serif text-[24px] leading-[32px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]"
          placeholder="Meeting title"
        />
        <div className="mt-[16px] flex items-center gap-[16px] rounded-[16px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[16px] py-[12px]">
          <span className="w-[72px] shrink-0 text-[22px] font-medium tabular-nums text-[var(--om-text-1)]" data-testid="meeting-timer">
            {clock(elapsed)}
          </span>
          <Waveform levels={levels} className="h-[32px] flex-1 justify-end" />
        </div>

        <section aria-label="Live transcript" className="mt-[16px] flex min-h-[220px] flex-1 flex-col rounded-[16px] border border-[var(--om-border)] bg-[var(--om-surface)]">
          <header className="flex items-center justify-between border-b border-[var(--om-border)] px-[16px] py-[10px]">
            <span className="text-[13px] font-medium text-[var(--om-text-1)]">Live transcript</span>
            <span className="text-[12px] text-[var(--om-text-3)]">{!liveAvailable ? "Not available in this browser" : liveState === "paused" ? "Reconnecting…" : liveState === "live" ? "Live" : ""}</span>
          </header>
          <div className="max-h-[46vh] flex-1 overflow-y-auto px-[16px] py-[12px] text-[15px] leading-[24px] text-[var(--om-text-1)]" data-testid="live-transcript" aria-live="polite">
            {finals.length === 0 && !interim ? (
              <p className="text-[var(--om-text-disabled)]">{liveAvailable ? "Say something. The transcript fills in here as you go." : "The live transcript isn't available in this browser. Your recording is still transcribed when you press Finish."}</p>
            ) : (
              <p>
                {finals.join(" ")}
                {interim ? <span className="text-[var(--om-text-3)]">{finals.length ? " " : ""}{interim}</span> : null}
              </p>
            )}
            <div ref={transcriptEnd} />
          </div>
        </section>
        {error ? <p className="mt-[10px] text-[12px] leading-[16px] text-[var(--om-text-2)]">{error}</p> : null}

        <div className="mt-[16px] flex flex-wrap items-center gap-[8px]">
          <button type="button" className={PRIMARY} onClick={() => void finish()} disabled={phase !== "recording"} data-testid="meeting-finish">
            <Square size={13} fill="currentColor" /> Finish
          </button>
          <button type="button" className={SECONDARY} onClick={() => void discard()} disabled={phase !== "recording"}>
            <Trash2 size={15} /> Discard
          </button>
          <span className="ml-auto text-[12px] text-[var(--om-text-3)]">Leave this tab open. A dropped connection does not stop the recording.</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex size-[44px] items-center justify-center rounded-[12px] bg-[var(--om-fill)] text-[var(--om-icon-1)]">
        <AudioLines size={22} />
      </div>
      <h1 className="mt-[16px] font-serif text-[28px] leading-[36px] text-[var(--om-text-1)]">Meeting recording</h1>
      <p className="mt-[8px] max-w-[520px] text-[14px] leading-[22px] text-[var(--om-text-2)]">
        Put your laptop on the table and hit record. You see the words as people speak; when you stop, the agent turns them into notes (decisions, who was there, follow-ups) inside a new task you can keep building on.
        {config.speakers ? " It also tells speakers apart when it can." : ""}
      </p>

      <div className="mt-[24px] flex flex-wrap gap-[8px]">
        <button type="button" className={PRIMARY} onClick={() => void start()} data-testid="meeting-start">
          <Circle size={12} fill="currentColor" className="text-[var(--om-danger)]" /> Start recording
        </button>
        <button type="button" className={SECONDARY} onClick={() => fileInput.current?.click()} data-testid="meeting-upload">
          <Upload size={15} /> Upload audio or video
        </button>
        <input ref={fileInput} type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.webm,.mp4,.mov,.ogg,.flac" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)} />
      </div>
      {error ? (
        <p role="alert" className="mt-[12px] text-[13px] leading-[18px] text-[var(--om-danger)]">
          {error}
        </p>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        className={cn("mt-[16px] flex items-center gap-[10px] rounded-[14px] border border-dashed px-[16px] py-[14px] text-[13px] text-[var(--om-text-3)] transition-colors", dragging ? "border-[var(--om-icon-1)] bg-[var(--om-fill-subtle)]" : "border-[var(--om-border)]")}
      >
        <FileAudio size={16} /> Or drop a recording here: MP3, M4A, WAV, WebM, MP4, MOV and most audio or video formats, up to 2 GB.
      </div>

      <ul className="mt-[16px] flex flex-col gap-[6px] text-[12px] leading-[18px] text-[var(--om-text-3)]">
        <li className="flex gap-[6px]">
          <Mic size={13} className="mt-[2px] shrink-0" /> Microphone only: audio from online meetings playing in other apps is not captured.
        </li>
        <li className="flex gap-[6px]">
          <WifiOff size={13} className="mt-[2px] shrink-0" /> Recording keeps going if the connection drops, and is saved in this browser until the notes are made.
        </li>
      </ul>

      {saved.length > 0 ? (
        <section className="mt-[28px]" aria-label="Saved recordings">
          <h2 className="text-[13px] font-medium text-[var(--om-text-1)]">Saved recordings</h2>
          <ul className="mt-[8px] flex flex-col gap-[8px]">
            {saved.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-[10px] rounded-[12px] border border-[var(--om-border)] px-[14px] py-[10px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-[var(--om-text-1)]">{r.title}</p>
                  <p className="text-[12px] text-[var(--om-text-3)]">
                    {new Date(r.startedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {clock((r.savedAt - r.startedAt) / 1000)} · {formatBytes(r.bytes)}
                    {r.state === "recording" ? " · interrupted" : ""}
                  </p>
                </div>
                <button type="button" className={SMALL} onClick={() => void process({ recording: r, title: r.title })} disabled={r.bytes === 0}>
                  Make notes
                </button>
                <button
                  type="button"
                  className={SMALL}
                  aria-label="Discard saved recording"
                  onClick={async () => {
                    if (!window.confirm("Discard this recording? It can't be recovered.")) return;
                    await deleteRecording(r.id).catch(() => undefined);
                    void refresh();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="mt-[28px]" aria-label="Recent meetings">
          <h2 className="text-[13px] font-medium text-[var(--om-text-1)]">Recent</h2>
          <ul className="mt-[8px] flex flex-col divide-y divide-[var(--om-border)]">
            {recent.slice(0, 10).map((m) => (
              <li key={m.id} className="flex items-center gap-[10px] py-[10px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-[var(--om-text-1)]">{m.title}</p>
                  <p className="text-[12px] text-[var(--om-text-3)]">
                    {new Date(m.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {STATUS_LABEL[m.status]}
                    {m.status === "error" && m.error ? `: ${m.error}` : ""}
                  </p>
                </div>
                {m.taskId ? (
                  <Link href={taskHref(m.taskId)} className={SMALL}>
                    Open notes
                  </Link>
                ) : m.status === "transcribing" || m.status === "summarizing" || m.status === "error" ? (
                  <button
                    type="button"
                    className={SMALL}
                    onClick={async () => {
                      setJob({ title: m.title, step: "transcribing", uploaded: m.sizeBytes, total: m.sizeBytes, meeting: m, error: null, recordingId: null, file: null });
                      setPhase("processing");
                      try {
                        const started = m.status === "error" ? (await startJob(m.id, true)).meeting : m;
                        const final = await waitForNotes(started.id, (x) => setJob((j) => (j ? { ...j, meeting: x, step: x.status === "done" ? "done" : x.status === "error" ? "error" : x.status === "summarizing" ? "summarizing" : "transcribing", error: x.error } : j)));
                        if (final.taskId) router.push(taskHref(final.taskId));
                      } catch (err) {
                        setJob((j) => (j ? { ...j, step: "error", error: err instanceof Error ? err.message : "Failed." } : j));
                      }
                    }}
                  >
                    {m.status === "error" ? "Retry" : "View progress"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-full w-full justify-center px-[16px] py-[40px] sm:px-[24px] sm:py-[64px]">
      <div className={cn("flex w-full flex-col", wide ? "max-w-[760px]" : "max-w-[640px]")}>{children}</div>
    </div>
  );
}
