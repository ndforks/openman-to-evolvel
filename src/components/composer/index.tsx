"use client";

/**
 * The task input. By default, sending creates a task with the stored mode, effort, speed and run target,
 * then opens it. Pass `onSubmit` to do something else with the input (for example, a follow-up message).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from "react";
import { cn } from "@/components/ui/cn";
import { ArrowUpIcon, CloseIcon, MicIcon, PaperclipIcon, SpinnerIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { InteractionChip, ReferenceChips, useReferences } from "@/components/task/extras";
import { taskHref } from "@/components/shell/task-list";
import { refreshTasks, useTasksStore } from "@/components/shell/tasks-store";
import { createTask, uploadAttachment, UPLOAD_MAX_BYTES } from "@/lib/agent/client";
import type { CreateTaskInput, TaskSummary } from "@/lib/agent/types";
import { useUI } from "@/lib/ui-store";
import { createWebsiteTask, isWebsitePrompt } from "@/lib/websites/client";
import { VOICE_INPUT_EVENT } from "@/components/settings/shortcuts";
import { ConnectorsMenu } from "./connectors-menu";
import { PlusMenu } from "./plus-menu";
import { ProjectPicker } from "./project-picker";
import { useSelectedProject } from "./projects";
import { SLASH_ITEMS, SLASH_LIST_ID, SlashMenu, filterSlashItems, slashOptionId, type SlashItem } from "./slash-menu";
import { useComposerHydration, useComposerStore } from "./store";
import { TargetPicker } from "./target-picker";
import { DictationBar, MeetingButton } from "@/components/voice";
import { useDictation } from "./use-dictation";

export { useComposerStore } from "./store";
export type { ComposerPrefs } from "./store";

export const COMPOSER_PLACEHOLDER = "Describe a job, or press / for shortcuts";

const MAX_INPUT_HEIGHT = 216;

/** 32 px tall borderless round button on the right of the toolbar (chat mode, microphone). */
const ROUND_BUTTON =
  "flex h-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]";

type Attachment = NonNullable<CreateTaskInput["attachments"]>[number];

export interface ComposerHandle {
  /** Focus the input and put the caret at the end. */
  focus: () => void;
  /** Send now. Pass `text` to send that instead of what is in the input. */
  submit: (text?: string) => void;
  /** Replace the input's text and put the caret after it. */
  setText: (text: string) => void;
}

export interface ComposerProps {
  /** Controlled text. Leave out to let the composer keep its own. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Show the row with the run target and project chips (default true). */
  showContext?: boolean;
  /** Files the task under this project. Leave out to use the one picked in the "Choose project" chip. */
  projectId?: string | null;
  /** Leave the "Choose project" chip out of the context row (a project page binds the composer to its project). */
  hideProjectPicker?: boolean;
  /** Replaces the default "create a task and open it". Throw to keep the text and show an error. */
  onSubmit?: (input: CreateTaskInput) => void | Promise<void>;
  /** Called after the default submit created a task, just before navigating to it. */
  onCreated?: (task: TaskSummary) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  ref?: Ref<ComposerHandle>;
}


export function Composer({
  value,
  defaultValue = "",
  onValueChange,
  placeholder = COMPOSER_PLACEHOLDER,
  showContext = true,
  projectId,
  hideProjectPicker = false,
  onSubmit,
  onCreated,
  autoFocus = false,
  disabled = false,
  className,
  ref,
}: ComposerProps) {
  useComposerHydration();
  const router = useRouter();
  const openModal = useUI((s) => s.open);
  const pickedProject = useSelectedProject();
  const [ownText, setOwnText] = useState(defaultValue);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chat (light Q&A, no computer) or Plan (confirm a plan first) for the next task; entered only from + or /.
  const [interaction, setInteraction] = useState<"agent" | "chat" | "plan">("agent");
  const references = useReferences();
  const [refPicker, setRefPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const text = value ?? ownText;
  const latestText = useRef(text);
  useEffect(() => {
    latestText.current = text;
  }, [text]);

  const change = useCallback(
    (next: string) => {
      latestText.current = next;
      if (value === undefined) setOwnText(next);
      onValueChange?.(next);
    },
    [value, onValueChange],
  );

  // Focus on arrival, but never take focus from a dialog that is already open (a `?modal=search` deep link).
  useEffect(() => {
    if (!autoFocus) return;
    const id = requestAnimationFrame(() => {
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [autoFocus]);

  const focusEnd = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // The new text lands on the next paint; move the caret once it is there.
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  }, []);

  // Grow with the text up to a limit, then scroll.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [text]);

  const appendPhrase = useCallback(
    (phrase: string) => {
      const current = latestText.current;
      change(current.trim() === "" ? phrase : `${current.replace(/\s+$/, "")} ${phrase}`);
    },
    [change],
  );
  const dictation = useDictation(appendPhrase);

  const canSend = text.trim() !== "" && !busy && !disabled && uploading.length === 0;

  const submit = async (override?: string) => {
    const prompt = (override ?? text).trim();
    if (prompt === "" || busy || disabled || uploading.length > 0) return;
    const { mode, effort, speed, target, connectors } = useComposerStore.getState();
    const input: CreateTaskInput = { prompt, mode, effort, speed, target };
    const project = projectId !== undefined ? projectId : (pickedProject?.id ?? null);
    if (project != null) input.projectId = project;
    if (connectors.length > 0) input.connectors = connectors;
    if (attachments.length > 0) input.attachments = attachments;
    if (interaction !== "agent") input.interaction = interaction;
    if (references.refs.length) input.references = references.refs.map((r) => r.id);

    setBusy(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(input);
      } else {
        // Website prompts ("Make a site for ...") go through the websites API, so the task ends with a live preview and a site record.
        const { task } = interaction === "agent" && isWebsitePrompt(prompt) ? await createWebsiteTask(input) : await createTask(input);
        onCreated?.(task);
        void refreshTasks();
        router.push(taskHref(task.id));
      }
      change("");
      setAttachments([]);
      references.clear();
      setInteraction("agent");
    } catch {
      setError("Could not start the task. Check your connection, then try once more.");
    } finally {
      setBusy(false);
    }
  };

  // The latest `submit` without making the imperative handle depend on every render.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useImperativeHandle(
    ref,
    () => ({
      focus: focusEnd,
      submit: (override) => void submitRef.current(override),
      setText: (next) => {
        change(next);
        focusEnd();
      },
    }),
    [focusEnd, change],
  );

  /* "/" menu: open while the text is a single word that starts with a slash. */
  const [slashClosedFor, setSlashClosedFor] = useState<string | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  const slashQuery = text.startsWith("/") && !/\s/.test(text) ? text.slice(1) : null;
  const slashMatches = useMemo(() => (slashQuery === null ? [] : filterSlashItems(SLASH_ITEMS, slashQuery)), [slashQuery]);
  const slashOpen = slashQuery !== null && slashMatches.length > 0 && slashClosedFor !== text && !disabled;
  const slashIndex = Math.min(slashActive, Math.max(slashMatches.length - 1, 0));

  const pickSlash = (item: SlashItem) => {
    change(item.insert ?? "");
    setSlashActive(0);
    if (item.insert) focusEnd();
    if (item.action === "skills") router.push("/app/skills");
    else if (item.action === "library") router.push("/app/library");
    else if (item.action === "local-files") fileRef.current?.click();
    else if (item.action === "recent-tasks") setRefPicker(true);
    else if (item.action === "chat") setInteraction("chat");
    else if (item.action === "plan") setInteraction("plan");
    else if (item.action === "other-sources") openModal("settings", { tab: "connectors" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && !event.nativeEvent.isComposing) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSlashActive((slashIndex + step + slashMatches.length) % slashMatches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickSlash(slashMatches[slashIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSlashClosedFor(text);
        return;
      }
    }
    // Enter sends; Shift+Enter (and Enter while an IME is composing) adds a line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const tooBig = files.find((file) => file.size > UPLOAD_MAX_BYTES);
    if (tooBig) setError(`"${tooBig.name}" is larger than 100 MB and was not attached.`);
    // Each file goes to the user's computer now; the message carries only its path (and a short preview for text).
    for (const file of files.filter((f) => f.size <= UPLOAD_MAX_BYTES)) {
      setUploading((list) => [...list, { name: file.name, progress: 0 }]);
      try {
        const chosen = useComposerStore.getState().target;
        const attached = await uploadAttachment(file, (progress) => setUploading((list) => list.map((u) => (u.name === file.name ? { ...u, progress } : u))), {
          computerId: chosen?.kind === "cloud-persistent" ? chosen.computerId : null,
        });
        setAttachments((current) => [...current, attached]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "One of the files could not be uploaded.");
      } finally {
        setUploading((list) => list.filter((u) => u.name !== file.name));
      }
    }
  };

  const toggleDictation = () => {
    if (!dictation.toggle()) setError("Voice input is not available in this browser.");
  };
  // A start that failed (microphone refused, no engine) ends before the bar shows: say why under the input.
  const dictationError = dictation.listening ? null : dictation.error;
  const shownError = error ?? dictationError;

  // The voice-input shortcut (Settings > Shortcuts, Ctrl+D by default) arrives as a window event. Only a composer
  // that is on screen answers it, so a hidden one does not start listening too.
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef(toggleDictation);
  useEffect(() => {
    toggleRef.current = toggleDictation;
  });
  useEffect(() => {
    if (disabled) return;
    const onVoice = () => {
      const root = rootRef.current;
      if (!root || root.offsetParent === null) return;
      toggleRef.current();
    };
    window.addEventListener(VOICE_INPUT_EVENT, onVoice);
    return () => window.removeEventListener(VOICE_INPUT_EVENT, onVoice);
  }, [disabled]);

  return (
    <div ref={rootRef} className={cn("group/chat-input mx-auto flex w-full flex-col", className)}>
      {/* Context bar: 64 px tall, its lower 20 px tucked under the input card, so 44 px show above it. */}
      {showContext ? (
        <div className="relative z-[1] -mb-[20px] flex flex-wrap items-center gap-0 rounded-t-[22px] bg-[var(--om-card)] px-[6px] pb-[26px] pt-[6px] shadow-[inset_0_0_0_1px_var(--om-shadow-highlight),inset_0_0_0_1px_var(--om-shadow-md)]">
          <TargetPicker />
          {hideProjectPicker ? null : <ProjectPicker />}
        </div>
      ) : null}

      <div data-testid="chat-input-composer" className="relative rounded-t-[22px] bg-[var(--om-bg)] pb-[8px]">
        <div className="relative z-[2] flex w-full flex-col gap-[12px] rounded-[22px] border border-black/8 bg-[var(--om-surface)] py-[12px] shadow-[0px_12px_32px_0px_rgba(0,0,0,0.02)] focus-within:border-black/20 dark:border-[var(--om-border)] dark:focus-within:border-[var(--om-border-strong)]">
          {slashOpen ? <SlashMenu items={slashMatches} active={slashIndex} onActive={setSlashActive} onPick={pickSlash} className="absolute bottom-[calc(100%-7px)] left-[16px]" /> : null}
          {refPicker && !slashOpen ? <RecentTaskPicker exclude={references.refs.map((r) => r.id)} onPick={(ref) => { references.add(ref); setRefPicker(false); focusEnd(); }} onClose={() => setRefPicker(false)} className="absolute bottom-[calc(100%-7px)] left-[16px]" /> : null}
          <ReferenceChips refs={references.refs} onRemove={references.remove} className="px-[16px]" />
          {text === "/" ? (
            <div aria-hidden="true" className="pointer-events-none absolute left-[16px] top-[13px] whitespace-pre font-sans text-[15px] leading-[24px] text-[var(--om-text-disabled)] sm:text-[16px]">
              <span className="invisible">/</span> Search a skill or select a tool...
            </div>
          ) : null}
          {attachments.length > 0 || uploading.length > 0 ? (
            <ul className="-mb-[4px] flex flex-wrap gap-[6px] px-[16px]">
              {uploading.map((u) => (
                <li key={`up-${u.name}`} aria-label={`Uploading ${u.name}`} className="flex h-[28px] max-w-[220px] items-center gap-[6px] rounded-[8px] bg-[var(--om-fill)] px-[8px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
                  <SpinnerIcon size={13} className="animate-spin" />
                  <span className="truncate">{u.name}</span>
                  <span className="shrink-0 tabular-nums">{Math.round(u.progress * 100)}%</span>
                </li>
              ))}
              {attachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex h-[28px] max-w-[220px] items-center gap-[6px] rounded-[8px] bg-[var(--om-fill)] pe-[4px] ps-[8px] text-[13px] leading-[18px] text-[var(--om-text-1)]">
                  <PaperclipIcon size={14} className="text-[var(--om-icon-2)]" />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                    className="flex size-[20px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none hover:bg-[var(--om-fill-strong)] focus-visible:bg-[var(--om-fill-strong)]"
                  >
                    <CloseIcon size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {dictation.listening ? (
            <DictationBar dictation={dictation} className="min-h-[50px]" onDone={() => inputRef.current?.focus()} />
          ) : (
          <textarea
            ref={inputRef}
            value={text}
            onChange={(event) => {
              change(event.target.value);
              setSlashActive(0);
              // Escape hides the menu only until the text changes again.
              setSlashClosedFor(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-controls={slashOpen ? SLASH_LIST_ID : undefined}
            aria-activedescendant={slashOpen ? slashOptionId(slashIndex) : undefined}
            rows={1}
            disabled={disabled}
            className="block max-h-[216px] min-h-[50px] w-full resize-none overflow-auto border-0 bg-transparent pe-[8px] ps-[16px] pt-[1px] font-sans text-[15px] leading-[24px] text-[var(--om-text-1)] outline-none [scrollbar-width:thin] placeholder:text-[var(--om-text-disabled)] sm:text-[16px]"
          />
          )}

          <div className="px-[12px]">
            <div className="flex items-center gap-[8px]">
              <div className="-my-[6px] flex min-w-0 flex-1 items-center gap-[8px] py-[6px]">
                <PlusMenu onPickFiles={() => fileRef.current?.click()} onReference={references.add} excludeIds={references.refs.map((r) => r.id)} onChatMode={() => setInteraction("chat")} onPlanMode={() => setInteraction("plan")} />
                <ConnectorsMenu />
                {interaction !== "agent" ? <InteractionChip interaction={interaction} onClear={() => setInteraction("agent")} /> : null}
                <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
              </div>
              <div className="flex shrink-0 items-center gap-[8px]">
                <div className="flex items-center">
                  <Tooltip label={dictation.listening ? "Stop listening" : "Voice input"}>
                    <button
                      type="button"
                      aria-label="Voice input"
                      aria-pressed={dictation.listening}
                      onClick={toggleDictation}
                      className={cn(ROUND_BUTTON, "w-[32px]", dictation.listening && "bg-[var(--om-fill-accent)] text-[var(--om-icon-accent)] hover:bg-[var(--om-fill-accent)]")}
                    >
                      <MicIcon size={16} />
                    </button>
                  </Tooltip>
                  <MeetingButton />
                </div>
                <button
                  type="button"
                  aria-label="Send"
                  disabled={!canSend}
                  onClick={() => void submit()}
                  className="flex size-[32px] min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--om-btn-primary)] p-0 text-[var(--om-icon-inverse)] outline-none transition-colors hover:opacity-90 focus-visible:opacity-90 active:opacity-80 disabled:cursor-default disabled:bg-[var(--om-fill-strong)] disabled:text-[var(--om-icon-disabled)] disabled:opacity-100"
                >
                  {busy ? <SpinnerIcon size={15} className="animate-spin" /> : <ArrowUpIcon size={15} strokeWidth={2.2} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {shownError ? (
          <p role="alert" className="mt-[8px] w-full text-center text-[12px] leading-[16px] text-[var(--om-danger)]">
            {shownError}
          </p>
        ) : (
          // An invisible line the height of the error message keeps the card 32 px above the bottom on Home.
          <p aria-hidden="true" className="pointer-events-none invisible mt-[8px] w-full select-none text-center text-[12px] leading-[16px]">
            &nbsp;
          </p>
        )}
      </div>
    </div>
  );
}

export default Composer;

/** "Recent tasks" from the slash menu: pick one to reference in the message (up to 20). */
function RecentTaskPicker({ exclude, onPick, onClose, className }: { exclude: string[]; onPick: (ref: { id: string; title: string }) => void; onClose: () => void; className?: string }) {
  const tasks = useTasksStore((s) => s.tasks);
  const shown = tasks.filter((t) => !exclude.includes(t.id)).slice(0, 20);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="listbox" aria-label="Reference a task" onMouseDown={(e) => e.preventDefault()} className={cn("z-30 flex max-h-[300px] w-[300px] flex-col overflow-y-auto rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] py-[4px] text-[14px] shadow-[0_8px_24px_var(--om-shadow-md)]", className)}>
      <div className="flex items-center justify-between px-[12px] py-[6px] text-[12px] text-[var(--om-text-3)]">
        <span>Reference a task</span>
        <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer rounded-[4px] px-1 hover:bg-[var(--om-fill)]">
          <CloseIcon size={12} />
        </button>
      </div>
      {shown.length === 0 ? <div className="px-[12px] py-[8px] text-[var(--om-text-3)]">No tasks yet</div> : null}
      {shown.map((t) => (
        <div key={t.id} role="option" aria-selected={false} data-reference-task={t.id} onClick={() => onPick({ id: t.id, title: t.title || "New task" })} className="mx-[4px] flex min-h-[34px] cursor-pointer items-center rounded-[8px] px-[8px] text-[var(--om-text-1)] hover:bg-[var(--om-fill)]">
          <span className="truncate">{t.title || "New task"}</span>
        </div>
      ))}
    </div>
  );
}
