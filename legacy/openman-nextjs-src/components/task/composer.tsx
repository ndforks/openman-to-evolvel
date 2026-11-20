// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Composer at the bottom of a task: follow-up input, the stop button while the agent runs, and the choice of
 * how a message is delivered to a running task (without interrupting, queued, or interrupting).
 * Above the input sits the status strip with the computer thumbnail and the plan progress.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CircleStop, Layers, ListEnd, SendHorizontal } from "lucide-react";
import { uploadAttachment, UPLOAD_MAX_BYTES } from "@/lib/agent/client";
import type { Interaction, TaskAttachment } from "@/lib/agent/types";
import { ReferenceChips, SwitchToAgentBar, useReferences } from "./extras";
import type { SendExtra } from "./use-task";
import { brand } from "@/config/brand";
import { ConnectorsMenu } from "@/components/composer/connectors-menu";
import { PlusMenu } from "@/components/composer/plus-menu";
import { targetLabel, useComposerStore } from "@/components/composer/store";
import { useDictation } from "@/components/composer/use-dictation";
import { usePref } from "@/components/settings/prefs";
import { VOICE_INPUT_EVENT } from "@/components/settings/shortcuts";
import { DictationBar, MeetingButton } from "@/components/voice";
import { cn } from "@/components/ui/cn";
import { ArrowUpIcon, ChevronDownIcon, CloseIcon, CloudIcon, LaptopIcon, MicIcon, PaperclipIcon, SpinnerIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { StatusBadge, type StatusLabel } from "./parts";
import type { PlanStep, QueuedMessage, SendMode } from "./reducer";
import { PlanList } from "./work-log";

export const SEND_MODES: readonly { id: SendMode; label: string; icon: ReactNode; shortcut?: string }[] = [
  { id: "steer", label: "Slip in while it works", icon: <SendHorizontal size={15} strokeWidth={1.7} aria-hidden="true" /> },
  { id: "interrupt", label: "Stop and send now", icon: <CircleStop size={15} strokeWidth={1.7} aria-hidden="true" /> },
  { id: "queue", label: "Send when it finishes", icon: <ListEnd size={15} strokeWidth={1.7} aria-hidden="true" />, shortcut: "⌘↵" },
];

const isSendMode = (value: unknown): value is SendMode => value === "steer" || value === "queue" || value === "interrupt";
const MAX_INPUT_HEIGHT = 216;
const SEND_FILL = "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]";

/* ---------------------------------------------------------------- status strip */

export interface StatusStripProps {
  label: StatusLabel;
  plan: PlanStep[];
  /** The computer thumbnail; clicking it opens the panel. */
  thumbnail: ReactNode;
  /** Idle tasks show a smaller thumbnail. */
  compact: boolean;
  onOpenComputer: () => void;
}

/** Plan progress ("2 / 4") that opens the full checklist. */
export function PlanProgress({ plan, side = "top" }: { plan: PlanStep[]; side?: "top" | "bottom" }) {
  if (plan.length === 0) return null;
  const done = plan.filter((s) => s.status === "done").length;
  const active = plan.find((s) => s.status === "active");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Plan: ${done} of ${plan.length} steps done`}
          className="group flex h-7 min-w-0 shrink cursor-pointer items-center gap-[6px] rounded-[8px] px-2 text-[13px] leading-[18px] text-[var(--om-text-3)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-text-2)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]"
        >
          {active ? <span className="min-w-0 truncate">{active.title}</span> : null}
          <span className="shrink-0 tabular-nums">
            {done} / {plan.length}
          </span>
          <ChevronDownIcon size={12} className={cn("shrink-0 transition-transform", side === "top" ? "rotate-180 group-data-[state=open]:rotate-0" : "group-data-[state=open]:rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="end" sideOffset={8} aria-label="Plan" className="flex w-[340px] max-w-[calc(100vw-32px)] flex-col p-[6px]">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <span className="text-[14px] font-semibold leading-5 text-[var(--om-text-1)]">Plan</span>
          <span className="text-[12px] leading-4 tabular-nums text-[var(--om-text-3)]">
            {done} / {plan.length}
          </span>
        </div>
        <PlanList plan={plan} className="tv-scroll max-h-[320px] overflow-y-auto" />
      </PopoverContent>
    </Popover>
  );
}

function StatusStrip({ label, plan, thumbnail, compact, onOpenComputer }: StatusStripProps) {
  return (
    <div className="relative flex h-10 shrink-0 items-center gap-2 pe-2 ps-4">
      <Tooltip label="Show the live desktop">
        <button
          type="button"
          aria-label="Show the live desktop"
          onClick={onOpenComputer}
          className={cn("shrink-0 cursor-pointer overflow-hidden outline-none transition-[width,height,margin] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]", compact ? "h-5 w-[29px] rounded-[4px]" : "mb-6 h-12 w-[72px] rounded-[8px]")}
        >
          {thumbnail}
        </button>
      </Tooltip>
      {/* The status keeps its words; a long step title is what gives way. */}
      <StatusBadge label={label} className={cn("shrink-0", compact ? "ms-1" : "ms-[6px]")} />
      <span className="min-w-2 flex-1" />
      <PlanProgress plan={plan} />
    </div>
  );
}

/* ---------------------------------------------------------------- send button */

function SendControl({ busy, hasText, stopping, defaultMode, onSend, onStop }: { busy: boolean; hasText: boolean; stopping: boolean; defaultMode: SendMode; onSend: (mode: SendMode) => void; onStop: () => void }) {
  if (busy && !hasText) {
    if (stopping) {
      return (
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--om-fill)] text-[var(--om-icon-3)]" role="status" aria-label="Stopping">
          <SpinnerIcon size={15} className="animate-spin" />
        </span>
      );
    }
    return (
      <Tooltip label="Stop">
        <button type="button" aria-label="Stop" onClick={onStop} className={cn("flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90", SEND_FILL)}>
          <span className="size-[10px] rounded-[2px] bg-[var(--om-icon-inverse)]" />
        </button>
      </Tooltip>
    );
  }

  if (busy) {
    const current = SEND_MODES.find((m) => m.id === defaultMode) ?? SEND_MODES[0];
    return (
      <div className="group/send flex h-[30px] shrink-0 items-center overflow-hidden rounded-full">
        <Tooltip label={current.label} shortcut="↵">
          <button type="button" aria-label={current.label} onClick={() => onSend(current.id)} className={cn("flex h-full cursor-pointer items-center rounded-s-full pe-2 ps-3 outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90", SEND_FILL)}>
            <ArrowUpIcon size={15} />
          </button>
        </Tooltip>
        <Menu>
          <Tooltip label="Send options">
            <MenuTrigger asChild>
              <button type="button" aria-label="Send options" className={cn("relative flex h-full cursor-pointer items-center rounded-e-full px-2 outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90 data-[state=open]:opacity-90", SEND_FILL)}>
                <span aria-hidden="true" className="pointer-events-none absolute start-0 top-1/2 h-4 w-px -translate-y-1/2 bg-current opacity-25 group-hover/send:opacity-0" />
                <ChevronDownIcon size={14} />
              </button>
            </MenuTrigger>
          </Tooltip>
          <MenuContent side="top" align="end" className="min-w-[217px]">
            {SEND_MODES.filter((m) => m.id !== current.id).map((m) => (
              <MenuItem key={m.id} onSelect={() => onSend(m.id)}>
                <span className="text-[var(--om-icon-2)]">{m.icon}</span>
                <span className="flex-1 whitespace-nowrap">{m.label}</span>
                {m.shortcut ? <span className="ps-3 text-[12px] leading-4 text-[var(--om-text-3)]">{m.shortcut}</span> : null}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    );
  }

  return (
    <Tooltip label="Send" shortcut="↵">
      <button
        type="button"
        aria-label="Send"
        disabled={!hasText}
        onClick={() => onSend(defaultMode)}
        className={cn("flex size-[30px] shrink-0 items-center justify-center rounded-full outline-none transition-colors", hasText ? cn("cursor-pointer hover:opacity-90 focus-visible:opacity-90", SEND_FILL) : "bg-[var(--om-fill-strong)] text-[var(--om-text-4)] dark:bg-[#383838]")}
      >
        <ArrowUpIcon size={15} />
      </button>
    </Tooltip>
  );
}

/* ---------------------------------------------------------------- composer */

export interface TaskComposerProps {
  /** The agent is working: an empty input shows Stop, a filled one offers the send modes. */
  busy: boolean;
  /** Status strip above the input; pass null to hide it (the computer panel shows the status instead). */
  strip: StatusStripProps | null;
  queued: QueuedMessage[];
  error: string | null;
  onSend: (text: string, mode: SendMode, extra?: SendExtra) => Promise<void>;
  onStop: () => Promise<void>;
  /** The task, for Chat mode's "Switch to Agent" and for leaving it out of the references. Null in mock mode. */
  taskId?: string | null;
  /** How the task works now: Chat shows "Switch to Agent"; Agent and Plan offer the Plan toggle. */
  interaction?: Interaction;
}

export function TaskComposer({ busy, strip, queued, error, onSend, onStop, taskId = null, interaction = "agent" }: TaskComposerProps) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [storedMode] = usePref<SendMode>("chat.defaultAction", "steer");
  const defaultMode: SendMode = isSendMode(storedMode) ? storedMode : "steer";
  const target = useComposerStore((s) => s.target);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stopping = stopRequested && busy;
  const references = useReferences();
  // Plan mode for the next message: the agent stops, plans the next step and waits for Confirm.
  const [planNext, setPlanNext] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState<string[]>([]);
  const planOn = interaction === "plan" || planNext;

  const dictation = useDictation((text) => setValue((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")} ${text}` : text)));

  // Grow with the text up to a limit, then scroll.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value]);

  const submit = (mode: SendMode) => {
    const text = value.trim();
    if (!text || uploading.length > 0) return;
    setValue("");
    setNotice(null);
    setStopRequested(false);
    const extra: SendExtra = {};
    if (references.refs.length) extra.references = references.refs.map((r) => r.id);
    if (planNext && interaction === "agent") extra.interaction = "plan";
    if (attachments.length) extra.attachments = attachments;
    void onSend(text, mode, extra);
    setAttachments([]);
    references.clear();
    setPlanNext(false);
    inputRef.current?.focus();
  };

  const stop = () => {
    setStopRequested(true);
    void onStop().finally(() => setStopRequested(false));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape in an empty input stops the running task (Enter sends, Cmd/Ctrl+Enter queues).
    if (event.key === "Escape" && busy && !stopping && value.trim() === "" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      stop();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    // Cmd/Ctrl+Enter adds the message to the queue while the agent is busy.
    submit(busy && (event.metaKey || event.ctrlKey) ? "queue" : defaultMode);
  };

  const toggleDictation = () => {
    if (!dictation.toggle()) setNotice("This browser has no voice input.");
  };
  // A start that failed (microphone refused, no engine) ends before the bar shows: say why under the input.
  const dictationError = dictation.listening ? null : dictation.error;

  // The voice-input shortcut (Settings > Shortcuts, Ctrl+D by default) arrives as a window event from the
  // app's shortcut handler. Only a composer that is on screen answers it.
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef(toggleDictation);
  useEffect(() => {
    toggleRef.current = toggleDictation;
  });
  useEffect(() => {
    const onVoice = () => {
      const root = rootRef.current;
      if (!root || root.offsetParent === null) return;
      toggleRef.current();
    };
    window.addEventListener(VOICE_INPUT_EVENT, onVoice);
    return () => window.removeEventListener(VOICE_INPUT_EVENT, onVoice);
  }, []);

  const placeholder = planOn ? "What should the plan cover?" : `Follow up with ${brand.agentNoun}`;
  const shownError = error ?? notice ?? dictationError;
  const surface = (
    <div className={cn("flex flex-col gap-[10px] rounded-[22px] border border-[var(--om-border-strong)] bg-[var(--om-input-fade)] py-3", strip && "-mx-px -mb-px")}>
      <ReferenceChips refs={references.refs} onRemove={references.remove} className="px-4" />
      {attachments.length || uploading.length ? (
        <ul className="flex flex-wrap gap-[6px] px-4" aria-label="Attached files">
          {uploading.map((name) => (
            <li key={`up-${name}`} className="flex h-[28px] max-w-[220px] items-center gap-[6px] rounded-[8px] bg-[var(--om-fill)] px-[8px] text-[13px] text-[var(--om-text-3)]">
              <SpinnerIcon size={13} className="animate-spin" />
              <span className="truncate">{name}</span>
            </li>
          ))}
          {attachments.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex h-[28px] max-w-[220px] items-center gap-[6px] rounded-[8px] bg-[var(--om-fill)] pe-[4px] ps-[8px] text-[13px] text-[var(--om-text-1)]">
              <PaperclipIcon size={14} className="text-[var(--om-icon-2)]" />
              <span className="truncate">{file.name}</span>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((list) => list.filter((_, i) => i !== index))} className="flex size-[20px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill-strong)]">
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {dictation.listening ? (
        <DictationBar dictation={dictation} className="min-h-[54px]" onDone={() => inputRef.current?.focus()} />
      ) : (
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="tv-scroll min-h-[54px] w-full resize-none bg-transparent pe-3 ps-4 font-sans text-[15px] leading-6 text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]"
        />
      )}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <PlusMenu onPickFiles={() => fileRef.current?.click()} onReference={taskId ? references.add : undefined} excludeIds={taskId ? [taskId, ...references.refs.map((r) => r.id)] : undefined} />
          <ConnectorsMenu />
          {taskId && interaction !== "chat" ? (
            <Tooltip label={interaction === "plan" ? "Plan mode is on: nothing runs until you approve the plan" : planNext ? "Your next message gets a plan first" : "Draft a plan before anything runs"}>
              <button
                type="button"
                aria-label="Plan mode"
                aria-pressed={planOn}
                disabled={interaction === "plan"}
                onClick={() => setPlanNext((v) => !v)}
                className={cn(
                  "flex h-[30px] shrink-0 cursor-pointer items-center gap-[5px] rounded-full border px-[10px] text-[13px] font-medium leading-5 outline-none transition-colors disabled:cursor-default",
                  planOn ? "border-transparent bg-[var(--om-fill-accent)] text-[var(--om-text-accent)]" : "border-[var(--om-border-strong)] text-[var(--om-text-2)] hover:bg-[var(--om-fill)]",
                )}
              >
                <Layers size={14} aria-hidden="true" />
                Plan
              </button>
            </Tooltip>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void (async () => {
                for (const file of files) {
                  if (file.size > UPLOAD_MAX_BYTES) {
                    setNotice(`"${file.name}" is larger than 100 MB and was not attached.`);
                    continue;
                  }
                  setUploading((list) => [...list, file.name]);
                  try {
                    const attached = await uploadAttachment(file, undefined, { taskId });
                    setAttachments((list) => [...list, attached]);
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : "The file could not be uploaded.");
                  } finally {
                    setUploading((list) => list.filter((n) => n !== file.name));
                  }
                }
              })();
            }}
          />
          <span className="flex h-[30px] min-w-0 items-center gap-[5px] rounded-full border border-[var(--om-border-strong)] px-[9px] text-[14px] leading-5 text-[var(--om-text-2)]" title="Where this task runs">
            {target.kind === "local" ? <LaptopIcon size={16} strokeWidth={1.7} /> : <CloudIcon size={16} />}
            <span className="truncate">{targetLabel(target)}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip label={dictation.listening ? "Stop listening" : "Voice input"}>
            <button
              type="button"
              aria-label="Voice input"
              aria-pressed={dictation.listening}
              onClick={toggleDictation}
              className={cn(
                "flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors",
                dictation.listening ? "bg-[var(--om-fill-accent)] text-[var(--om-icon-accent)]" : "text-[var(--om-icon-2)] hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]",
              )}
            >
              <MicIcon size={18} />
            </button>
          </Tooltip>
          <MeetingButton className="size-[30px]" size={18} />
          <SendControl busy={busy} hasText={value.trim().length > 0} stopping={stopping} defaultMode={defaultMode} onSend={submit} onStop={stop} />
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="flex w-full flex-col">
      {taskId && interaction === "chat" ? <SwitchToAgentBar taskId={taskId} busy={busy} /> : null}
      {queued.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-1" aria-label="Queued messages">
          {queued.map((message) => (
            <li key={message.id} className="tv-rise-in flex h-9 items-center gap-2 rounded-[10px] border border-[var(--om-border)] bg-[var(--om-card)] px-3 text-[13px] leading-[18px]">
              <span className="shrink-0 text-[var(--om-text-3)]">Queued</span>
              <span className="min-w-0 truncate text-[var(--om-text-2)]">{message.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {strip ? (
        <div className="flex flex-col rounded-[22px] border border-[var(--om-border)] bg-[var(--om-card)]">
          <StatusStrip {...strip} />
          {surface}
        </div>
      ) : (
        surface
      )}
      {shownError ? (
        <p role="alert" className="px-4 pt-2 text-[13px] leading-[18px] text-[var(--om-danger)]">
          {shownError}
        </p>
      ) : null}
      <p className="flex min-h-8 items-center justify-center px-2 py-[6px] text-center text-[12px] leading-4 text-[var(--om-text-3)]">{brand.name} can get things wrong. Check anything important.</p>
    </div>
  );
}
