"use client";

/**
 * "Record a skill": name a recording, demonstrate the task on your computer through the live viewer while the
 * recorder captures it, review the steps, then let the agent turn them into a skill.
 *
 * Phases: setup -> recording -> saving ("Saving skill recording...") -> review -> processing ("Skill recording ·
 * Processing") -> done (the skill card) | failed. If the live view drops while recording, what was captured is kept
 * and the page says "Skill recording stopped. Open the recorder to try again."
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ExternalLink, ImageOff, Monitor, RotateCcw, ShieldCheck, Trash2, Video } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/task/parts";
import { SkillCover, prettyName } from "@/components/pages/skills/SkillCover";
import type { ComputerView } from "@/lib/agent/types";
import { imageUrl, RecordingApiError, recordingsApi } from "@/lib/recording/client";
import { Recorder, type RecorderSnapshot } from "@/lib/recording/recorder";
import { clock, describeStep, type RecordedStep, type Recording, type RecordingSkill } from "@/lib/recording/types";
import { VncViewer, type VncHandle, type VncState } from "../vnc-viewer";
import { RecorderBar } from "./recorder-bar";

type Phase =
  | { kind: "loading" }
  | { kind: "setup"; open: Recording | null }
  | { kind: "recording"; rec: Recording }
  | { kind: "saving"; rec: Recording }
  | { kind: "stopped"; rec: Recording }
  | { kind: "review"; rec: Recording }
  | { kind: "processing"; rec: Recording; taskStatus: string | null }
  | { kind: "done"; rec: Recording; skill: RecordingSkill | null }
  | { kind: "failed"; rec: Recording };

const PRIMARY = "inline-flex h-9 cursor-pointer items-center justify-center gap-[6px] rounded-[10px] bg-[var(--om-btn-primary)] px-[14px] text-[14px] font-medium text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40";
const SECONDARY = "inline-flex h-9 cursor-pointer items-center justify-center gap-[6px] rounded-[10px] border border-[var(--om-border-strong)] px-[14px] text-[14px] font-medium text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] disabled:cursor-default disabled:opacity-40";
const INPUT = "h-[38px] w-full rounded-[10px] border border-[var(--om-border-strong)] bg-transparent px-[12px] text-[14px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]";

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "") || "my-skill";

function phaseFor(rec: Recording, skill: RecordingSkill | null = null, taskStatus: string | null = null): Phase {
  switch (rec.status) {
    case "recording":
      return { kind: "stopped", rec };
    case "review":
      return { kind: "review", rec };
    case "processing":
      return { kind: "processing", rec, taskStatus };
    case "done":
      return { kind: "done", rec, skill };
    case "failed":
      return { kind: "failed", rec };
  }
}

/* ---------------------------------------------------------------- what is captured */

function CaptureNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-[12px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] p-3 text-[13px] leading-[18px] text-[var(--om-text-2)]", compact && "p-2")}>
      <div className="flex items-center gap-2 font-medium text-[var(--om-text-1)]">
        <ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" /> What is captured
      </div>
      <ul className="flex list-disc flex-col gap-1 ps-5">
        <li>Clicks, drags and scrolls on the computer screen, with where they happened.</li>
        <li>Keys and text you type into the computer, grouped into words and shortcuts, and text you paste.</li>
        <li>A screenshot of the computer before and after each action, and the title of the active window.</li>
      </ul>
      <div className="font-medium text-[var(--om-text-1)]">Not captured</div>
      <ul className="flex list-disc flex-col gap-1 ps-5">
        <li>Anything while capture is paused: pause before a sensitive step.</li>
        <li>Text typed at a password prompt the recorder can recognise (after sudo, su, passwd, ssh, or in a window titled like a sign-in or password dialog).</li>
        <li>Mouse movement without a click, your own screen, camera or microphone.</li>
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- live screen */

function useHomeView(enabled: boolean) {
  const [view, setView] = useState<ComputerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const load = useCallback(() => {
    recordingsApi
      .computer()
      .then((r) => {
        setError(null);
        setView(r.view);
        setStatus(r.status);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Your computer could not be reached."));
  }, []);
  useEffect(() => {
    if (enabled && !view) load();
  }, [enabled, view, load]);
  return { view, error, status, reload: load };
}

/* ---------------------------------------------------------------- main */

export function SkillRecorder() {
  const router = useRouter();
  const params = useSearchParams();
  const idParam = params.get("id");
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const live = phase.kind === "setup" || phase.kind === "recording";
  const { view, error: viewError, status: computerStatus, reload } = useHomeView(live);

  // Initial load: a recording named in the URL, or the setup screen (with any recording still to be delivered).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (idParam) {
          const r = await recordingsApi.get(idParam);
          if (!cancelled) setPhase(phaseFor(r.recording, r.skill, r.taskStatus));
          return;
        }
        const { recordings } = await recordingsApi.list(true);
        if (!cancelled) setPhase({ kind: "setup", open: recordings[0] ?? null });
      } catch (err) {
        if (!cancelled) {
          toast(err instanceof Error ? err.message : "The recording could not be loaded.", "error");
          setPhase({ kind: "setup", open: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idParam]);

  const go = useCallback(
    (rec: Recording | null) => {
      router.replace(rec ? `/app/skills/record?id=${rec.id}` : "/app/skills/record");
    },
    [router],
  );

  const start = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { recording } = await recordingsApi.create(name.trim(), view?.width, view?.height);
      setPhase({ kind: "recording", rec: recording });
    } catch (err) {
      if (err instanceof RecordingApiError && err.code === "open_recording") {
        setPhase({ kind: "setup", open: (err.body?.recording as Recording) ?? null });
      }
      toast(err instanceof Error ? err.message : "The recording could not start.", "error");
    } finally {
      setBusy(false);
    }
  };

  const discard = async (rec: Recording) => {
    setBusy(true);
    try {
      await recordingsApi.remove(rec.id);
      toast("Recording discarded.");
      if (idParam) go(null);
      else setPhase({ kind: "setup", open: null });
    } catch (err) {
      toast(err instanceof Error ? err.message : "The recording could not be discarded.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toReview = async (rec: Recording) => {
    setBusy(true);
    try {
      const { recording } = await recordingsApi.finish(rec.id);
      setPhase({ kind: "review", rec: recording });
      go(recording);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The recording could not be saved.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-[var(--om-text-3)]">
        <Spinner size={16} /> Opening the recorder...
      </div>
    );
  }

  if (phase.kind === "recording") {
    return (
      <RecordingStage
        rec={phase.rec}
        view={view}
        onSaving={() => setPhase({ kind: "saving", rec: phase.rec })}
        onStopped={(rec) => setPhase({ kind: "stopped", rec })}
        onFinished={(rec) => {
          setPhase({ kind: "review", rec });
          go(rec);
        }}
      />
    );
  }

  if (phase.kind === "saving") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" role="status">
        <Spinner size={20} />
        <div className="text-[15px] font-medium text-[var(--om-text-1)]">Saving skill recording...</div>
        <div className="text-[13px] text-[var(--om-text-3)]">Uploading the last steps and screenshots.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full flex-col bg-[var(--om-bg)] text-[var(--om-text-1)]">
      <header className="sticky top-0 z-20 flex h-[56px] shrink-0 items-center gap-3 bg-[var(--om-bg)] pl-[22px] pr-[18px]">
        <Link href="/app/skills" aria-label="Back to skills" className="flex size-8 items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
          <ArrowLeft size={17} strokeWidth={1.8} />
        </Link>
        <h1 className="truncate text-[17px] font-medium leading-[24px]">
          {phase.kind === "setup" ? "Record a skill" : phase.kind === "processing" ? "Skill recording · Processing" : `Skill recording · ${phase.rec.name}`}
        </h1>
      </header>
      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-5 px-[22px] pb-10">
        {phase.kind === "setup" ? (
          <Setup
            open={phase.open}
            name={name}
            setName={setName}
            busy={busy}
            view={view}
            viewError={viewError}
            computerStatus={computerStatus}
            onRetryView={reload}
            onStart={start}
            onContinue={(rec) => go(rec)}
            onDiscard={discard}
          />
        ) : phase.kind === "stopped" ? (
          <div className="flex flex-col items-start gap-4 rounded-[16px] border border-[var(--om-border)] p-6">
            <div className="flex items-center gap-2 text-[15px] font-medium">
              <Video size={17} strokeWidth={1.8} aria-hidden="true" /> Skill recording stopped. Open the recorder to try again.
            </div>
            <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">The live view closed before you pressed Stop. The steps captured so far are kept: review them and create the skill, or discard the recording and record again.</p>
            <div className="flex gap-2">
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => void toReview(phase.rec)}>
                Review what was recorded
              </button>
              <button type="button" className={SECONDARY} disabled={busy} onClick={() => void discard(phase.rec)}>
                Discard
              </button>
            </div>
          </div>
        ) : phase.kind === "review" ? (
          <Review rec={phase.rec} onDiscard={() => void discard(phase.rec)} onGenerated={(rec) => setPhase({ kind: "processing", rec, taskStatus: null })} />
        ) : (
          <Outcome phase={phase} setPhase={setPhase} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- setup */

function Setup(props: {
  open: Recording | null;
  name: string;
  setName: (v: string) => void;
  busy: boolean;
  view: ComputerView | null;
  viewError: string | null;
  computerStatus: string | null;
  onRetryView: () => void;
  onStart: () => void;
  onContinue: (rec: Recording) => void;
  onDiscard: (rec: Recording) => void;
}) {
  const { open, name, setName, busy, view, viewError, computerStatus } = props;
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] leading-[20px] text-[var(--om-text-2)]">
          Show {brand.agentNoun} how you do a task once, on your computer. When you stop, review the steps and {brand.agentNoun} writes a reusable skill from them.
        </p>
        {open ? (
          <div role="alert" className="flex flex-col gap-3 rounded-[12px] border border-[var(--om-warning)] p-3 text-[13px] leading-[18px]">
            <span>
              &quot;{open.name}&quot; hasn&apos;t been delivered yet. Finish delivering it or discard it before starting another recording.
            </span>
            <div className="flex gap-2">
              <button type="button" className={PRIMARY} onClick={() => props.onContinue(open)} disabled={busy}>
                Finish delivering
              </button>
              <button type="button" className={SECONDARY} onClick={() => props.onDiscard(open)} disabled={busy}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              props.onStart();
            }}
          >
            <label className="flex flex-col gap-[6px] text-[13px] font-medium" htmlFor="rec-name">
              Name the recording
              <input id="rec-name" className={INPUT} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Check disk usage in the terminal" autoFocus />
            </label>
            <button type="submit" className={PRIMARY} disabled={!name.trim() || busy || !view?.vncUrl}>
              {busy ? <Spinner size={14} className="text-current" /> : <span className="size-[8px] rounded-full bg-[#ef4444]" aria-hidden="true" />}
              Start recording
            </button>
            {!view?.vncUrl && !viewError ? <span className="text-[12px] text-[var(--om-text-3)]">{computerStatus && computerStatus !== "running" ? `Your computer is ${computerStatus}. Start it from Computers, then come back.` : "Connecting to your computer..."}</span> : null}
          </form>
        )}
        <CaptureNotice />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[13px] text-[var(--om-text-3)]">
          <Monitor size={14} strokeWidth={1.8} aria-hidden="true" /> Your computer
        </div>
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[14px] border border-[var(--om-border)] bg-[#111]">
          {view?.vncUrl ? (
            <VncViewer url={view.vncUrl} interactive={false} showMode />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px] text-[var(--om-text-3)]">
              {viewError ? (
                <>
                  <span>{viewError}</span>
                  <button type="button" className={SECONDARY} onClick={props.onRetryView}>
                    Retry
                  </button>
                </>
              ) : (
                <Spinner size={16} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- recording */

function RecordingStage({ rec, view, onSaving, onStopped, onFinished }: { rec: Recording; view: ComputerView | null; onSaving: () => void; onStopped: (rec: Recording) => void; onFinished: (rec: Recording) => void }) {
  const [handle, setHandle] = useState<VncHandle | null>(null);
  const [snap, setSnap] = useState<RecorderSnapshot | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const stopping = useRef(false);
  const [startedAt] = useState(() => Date.parse(rec.startedAt) || Date.now());

  // The recorder attaches to the viewer once it is connected, and survives reconnects of the same viewer.
  useEffect(() => {
    if (!handle || recorder.current) return;
    const r = new Recorder({ recordingId: rec.id, host: handle.host, canvas: handle.canvas, onChange: setSnap });
    recorder.current = r;
    r.start();
  }, [handle, rec.id]);

  useEffect(
    () => () => {
      // Leaving the page mid-recording: keep what was captured so far.
      if (!stopping.current) void recorder.current?.stop();
    },
    [],
  );

  const stop = async (dropped = false) => {
    if (stopping.current) return;
    stopping.current = true;
    if (!dropped) onSaving();
    const r = recorder.current;
    const size = r?.screenSize();
    await r?.stop();
    if (dropped) {
      onStopped(rec);
      return;
    }
    try {
      const { recording } = await recordingsApi.finish(rec.id, size?.width, size?.height);
      onFinished(recording);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The recording could not be saved.", "error");
      onStopped(rec);
    }
  };

  const onState = (state: VncState) => {
    if (state === "failed") void stop(true);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#0b0b0b]">
      <div className="relative min-h-0 flex-1">
        {view?.vncUrl ? <VncViewer url={view.vncUrl} interactive onStateChange={onState} onReady={setHandle} showMode /> : null}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-[#ef4444]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <RecorderBar
          name={rec.name}
          startedAt={startedAt}
          snap={snap}
          canPaste={!!handle}
          onPause={() => recorder.current?.pause()}
          onResume={() => {
            recorder.current?.resume();
            handle?.focus();
          }}
          onStop={() => void stop(false)}
          onPaste={(text) => {
            handle?.paste(text);
            recorder.current?.recordPaste(text);
            handle?.focus();
            toast("Sent to the computer's clipboard. Press Ctrl+V there (Ctrl+Shift+V in a terminal).");
          }}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- review */

function Thumb({ rec, step }: { rec: Recording; step: RecordedStep }) {
  const [which, setWhich] = useState<"after" | "before">(step.after ? "after" : "before");
  const [big, setBig] = useState(false);
  const key = which === "after" ? (step.after ?? step.before) : (step.before ?? step.after);
  if (!key) {
    return (
      <span className="flex h-[72px] w-[128px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--om-fill)] text-[var(--om-icon-3)]">
        <ImageOff size={16} aria-hidden="true" />
      </span>
    );
  }
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <button type="button" onClick={() => setBig(true)} className="relative h-[72px] w-[128px] cursor-zoom-in overflow-hidden rounded-[8px] border border-[var(--om-border)] bg-black" aria-label="Enlarge screenshot">
        {/* eslint-disable-next-line @next/next/no-img-element -- screenshots served by our own route */}
        <img src={imageUrl(rec.id, key)} alt={`Screen ${which} step`} className="size-full object-cover" loading="lazy" />
        {step.x !== undefined && step.y !== undefined ? <span aria-hidden="true" className="absolute size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#ef4444]" style={{ left: `${step.x * 100}%`, top: `${step.y * 100}%` }} /> : null}
      </button>
      {step.before && step.after ? (
        <div className="flex gap-1 text-[11px]">
          {(["before", "after"] as const).map((w) => (
            <button key={w} type="button" onClick={() => setWhich(w)} className={cn("cursor-pointer rounded-[5px] px-[6px] py-[1px]", which === w ? "bg-[var(--om-fill-strong)] text-[var(--om-text-1)]" : "text-[var(--om-text-3)]")}>
              {w === "before" ? "Before" : "After"}
            </button>
          ))}
        </div>
      ) : null}
      {big ? (
        <div role="dialog" aria-label="Screenshot" className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6" onClick={() => setBig(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- screenshots served by our own route */}
          <img src={imageUrl(rec.id, key)} alt="" className="max-h-full max-w-full rounded-[8px]" />
        </div>
      ) : null}
    </div>
  );
}

function Review({ rec, onDiscard, onGenerated }: { rec: Recording; onDiscard: () => void; onGenerated: (rec: Recording) => void }) {
  const [current, setCurrent] = useState(rec);
  const [steps, setSteps] = useState<RecordedStep[]>(() => rec.steps ?? []);
  const [description, setDescription] = useState(rec.description);
  const [skillName, setSkillName] = useState(rec.skillName ?? slug(rec.name));
  const [busy, setBusy] = useState(false);
  const removed = (current.steps?.length ?? 0) - steps.length;
  const real = steps.filter((s) => s.kind !== "pause");

  const save = async () => {
    const { recording } = await recordingsApi.patch(current.id, { description, steps: steps.map((s) => ({ id: s.id, note: s.note })) });
    setCurrent(recording);
    return recording;
  };

  const generate = async () => {
    setBusy(true);
    try {
      await save();
      const { recording } = await recordingsApi.generate(current.id, skillName.trim() || undefined);
      onGenerated(recording);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The skill could not be started.", "error");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await save();
      const { recording } = await recordingsApi.restore(current.id);
      setCurrent(recording);
      setSteps(recording.steps ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The steps could not be restored.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <label className="flex flex-col gap-[6px] text-[13px] font-medium" htmlFor="rec-desc">
          What is this for?
          <textarea id="rec-desc" value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the task and when it should be used. The agent reads this together with the steps." className="w-full resize-y rounded-[10px] border border-[var(--om-border-strong)] bg-transparent p-[10px] text-[14px] font-normal leading-[20px] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]" />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-medium" htmlFor="rec-skill">
          Skill name
          <input id="rec-skill" className={INPUT} value={skillName} maxLength={64} onChange={(e) => setSkillName(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-"))} />
          <span className="text-[12px] font-normal text-[var(--om-text-3)]">Lower-case letters, digits and dashes.</span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium">
          {real.length} steps · {clock(Math.max(0, Date.parse(current.endedAt ?? current.updatedAt) - Date.parse(current.startedAt)))}
        </h2>
        {removed > 0 ? (
          <button type="button" onClick={() => void restore()} disabled={busy} className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-[var(--om-text-2)] hover:text-[var(--om-text-1)]">
            <RotateCcw size={13} aria-hidden="true" /> Restore {removed} deleted
          </button>
        ) : null}
      </div>

      {steps.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[var(--om-border-strong)] p-6 text-center text-[13px] text-[var(--om-text-3)]">No steps were captured. Discard this recording and record again while you control the screen.</div>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Recorded steps">
          {steps.map((s, i) => (
            <li key={s.id} className={cn("flex gap-3 rounded-[12px] border border-[var(--om-border)] p-3", s.kind === "pause" && "border-dashed opacity-70")} data-step-kind={s.kind}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--om-fill)] text-[12px] font-medium tabular-nums">{i + 1}</span>
              {s.kind === "pause" ? null : <Thumb rec={current} step={s} />}
              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 break-words text-[14px] leading-[20px]">{describeStep(s)}</span>
                  <span className="shrink-0 font-mono text-[12px] text-[var(--om-text-3)]">{clock(s.t)}</span>
                  <button type="button" aria-label={`Delete step ${i + 1}`} onClick={() => setSteps((all) => all.filter((x) => x.id !== s.id))} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-[var(--om-icon-3)] hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)]">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
                {s.window ? <span className="truncate text-[12px] text-[var(--om-text-3)]">Window: {s.window}</span> : null}
                {s.kind === "pause" ? null : (
                  <input
                    aria-label={`Note for step ${i + 1}`}
                    value={s.note ?? ""}
                    maxLength={1000}
                    onChange={(e) => setSteps((all) => all.map((x) => (x.id === s.id ? { ...x, note: e.target.value } : x)))}
                    placeholder="Add a note: why this step, what to look for, what can vary"
                    className="h-8 w-full rounded-[8px] border border-transparent bg-[var(--om-fill-subtle)] px-[10px] text-[13px] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]"
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--om-border)] bg-[var(--om-bg)] py-3">
        <button type="button" className={SECONDARY} onClick={onDiscard} disabled={busy}>
          Discard
        </button>
        <button type="button" className={PRIMARY} onClick={() => void generate()} disabled={busy || real.length === 0 || !skillName.trim()}>
          {busy ? <Spinner size={14} className="text-current" /> : null}
          Create skill
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- processing, done, failed */

function Outcome({ phase, setPhase }: { phase: Extract<Phase, { kind: "processing" | "done" | "failed" }>; setPhase: (p: Phase) => void }) {
  const rec = phase.rec;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase.kind !== "processing") return;
    let cancelled = false;
    const t = setInterval(() => {
      recordingsApi
        .get(rec.id)
        .then((r) => {
          if (cancelled) return;
          const next = phaseFor(r.recording, r.skill, r.taskStatus);
          if (next.kind !== "processing" || r.taskStatus !== phase.taskStatus) setPhase(next);
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [phase, rec.id, setPhase]);

  const regenerate = async () => {
    setBusy(true);
    try {
      const { recording } = await recordingsApi.generate(rec.id);
      setPhase({ kind: "processing", rec: recording, taskStatus: null });
    } catch (err) {
      toast(err instanceof Error ? err.message : "The skill could not be started.", "error");
    } finally {
      setBusy(false);
    }
  };

  const taskLink = rec.taskId ? (
    <Link href={`/app/task/${rec.taskId}`} className={SECONDARY}>
      <ExternalLink size={14} aria-hidden="true" /> Open the task
    </Link>
  ) : null;

  if (phase.kind === "processing") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-[16px] border border-[var(--om-border)] p-6" role="status">
        <div className="flex items-center gap-2 text-[15px] font-medium">
          <Spinner size={16} /> {brand.agentNoun} is writing the skill &quot;{rec.skillName}&quot;
        </div>
        <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
          It reads your {(rec.steps ?? []).filter((s) => s.kind !== "pause").length} steps, notes and screenshots, then saves a skill with instructions and annotated references on your computer. This usually takes a few minutes.
          {phase.taskStatus === "waiting" ? ` ${brand.agentNoun} is waiting for your answer in the task.` : ""}
        </p>
        {taskLink}
      </div>
    );
  }

  if (phase.kind === "failed") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-[16px] border border-[var(--om-border)] p-6">
        <div className="text-[15px] font-medium">The skill wasn&apos;t saved</div>
        <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{rec.detail ?? "Something went wrong while writing the skill."} The recording is kept, so you can try again.</p>
        <div className="flex gap-2">
          <button type="button" className={PRIMARY} onClick={() => void regenerate()} disabled={busy}>
            Try again
          </button>
          {taskLink}
        </div>
      </div>
    );
  }

  const skill = phase.skill;
  const skillName = skill?.name ?? rec.skillName ?? "";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-[14px] text-[var(--om-text-2)]">
        <Check size={16} className="text-[var(--om-success,#22c55e)]" aria-hidden="true" /> Skill saved on your computer
      </div>
      <div className="flex gap-5 rounded-[16px] border border-[var(--om-border)] p-5" data-testid="recorded-skill-card">
        <SkillCover name={skillName} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="text-[16px] font-semibold">{prettyName(skillName)}</div>
          <div className="font-mono text-[12px] text-[var(--om-text-3)]">/{skillName}</div>
          <p className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{skill?.description || "Made from your recording."}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={`/app/skills?skill=${encodeURIComponent(skillName)}`} className={PRIMARY}>
              Open in Skills
            </Link>
            {taskLink}
            <button type="button" className={SECONDARY} onClick={() => void regenerate()} disabled={busy}>
              <RotateCcw size={14} aria-hidden="true" /> Regenerate
            </button>
            <Link href="/app/skills/record" className={SECONDARY}>
              Record another
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
