// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

import { ArrowUp, Mic, Paperclip, RotateCcw, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ConnectorsMenu } from "@/components/composer/connectors-menu";
import { PlusMenu } from "@/components/composer/plus-menu";
import { ProjectPicker } from "@/components/composer/project-picker";
import { useComposerStore } from "@/components/composer/store";
import { TargetPicker } from "@/components/composer/target-picker";
import { TopBar } from "@/components/shell/top-bar";
import { brand } from "@/config/brand";
import { createTask, uploadAttachment, UPLOAD_MAX_BYTES } from "@/lib/agent/client";
import type { CreateTaskInput } from "@/lib/agent/types";
import { cx } from "../cx";
import { AUTOMATION_KINDS, AUTOMATION_SUGGESTIONS, type AutomationStart, type AutomationSuggestion } from "../data/automations";
import { AUTOMATIONS_HREF, NEW_AUTOMATION_HREF, taskHref } from "../routes";
import { BrandLogo, PageShell } from "../ui";
import { useAutomationDraft } from "./draft";
import { AdvancedEditor, ScheduleEditor, TriggerEditor } from "./Editors";
import { StartIcon, TriggerIcon } from "./icons";

const PER_PAGE = 3;
type Attachment = NonNullable<CreateTaskInput["attachments"]>[number];

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function SuggestionCard({ suggestion, onPick }: { suggestion: AutomationSuggestion; onPick: (s: AutomationSuggestion) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(suggestion)}
      className="relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] text-start outline-none transition-transform duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)] motion-safe:hover:scale-[1.02]"
    >
      <span className="flex w-full min-w-0 flex-col bg-[var(--om-fill-strong)] p-[16px] md:p-[24px]">
        <span className="flex h-[58px] min-w-0 items-start gap-[8px] overflow-hidden rounded-[12px] border border-[var(--om-border-subtle)] bg-[var(--om-surface)] p-[12px]">
          <span className="flex size-[16px] shrink-0 items-center justify-center">
            <BrandLogo src={suggestion.app.logo} w={Math.min(16, suggestion.app.w)} h={Math.min(16, suggestion.app.h ?? suggestion.app.w)} label={suggestion.app.name} />
          </span>
          <span className="line-clamp-2 min-w-0 break-words text-[12px] leading-[16px] text-[var(--om-text-2)]">{suggestion.when}</span>
        </span>
        <span aria-hidden className="relative flex h-[12px] shrink-0 items-center justify-center">
          <span className="absolute z-[1] flex size-[28px] items-center justify-center rounded-full border border-[var(--om-border-subtle)] bg-[var(--om-surface)] text-[var(--om-icon-3)] shadow-[0_0_1px_var(--om-shadow-md),0_4px_8px_var(--om-shadow-sm)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14" />
              <path d="m6 13 6 6 6-6" />
            </svg>
          </span>
        </span>
        <span className="flex h-[58px] min-w-0 items-start gap-[8px] rounded-[12px] border border-[var(--om-border-subtle)] bg-[var(--om-surface)] p-[12px]">
          <span className="shrink-0 text-[var(--om-icon-1)]">
            <BrandLogo src={brand.logoMark} w={16} h={16} />
          </span>
          <span className="line-clamp-2 min-w-0 break-words text-[12px] leading-[16px] text-[var(--om-text-2)]">{suggestion.then}</span>
        </span>
      </span>
    </button>
  );
}

/** New-task screen in automation mode: describe the work, then choose how it starts. */
export function AutomateYourWork() {
  const router = useRouter();
  const params = useSearchParams();
  const chosen = useAutomationDraft((s) => s.start);
  // `?start=schedule|trigger|advanced` opens that editor directly (links, reloads); the store wins once set.
  const fromUrl = params.get("start");
  const start = chosen ?? (AUTOMATION_KINDS.some((k) => k.id === fromUrl) ? (fromUrl as AutomationStart) : null);
  const closeEditor = () => {
    setStart(null);
    if (fromUrl) router.replace(NEW_AUTOMATION_HREF);
  };
  const setStart = useAutomationDraft((s) => s.setStart);
  const prompt = useAutomationDraft((s) => s.prompt);
  const setPrompt = useAutomationDraft((s) => s.setPrompt);
  const reset = useAutomationDraft((s) => s.reset);

  const [page, setPage] = useState(0);
  const [showStart, setShowStart] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const pages = Math.ceil(AUTOMATION_SUGGESTIONS.length / PER_PAGE);
  const suggestions = AUTOMATION_SUGGESTIONS.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const canSend = prompt.trim().length > 0 && !sending && uploadingCount === 0;

  const pick = (suggestion: AutomationSuggestion) => {
    const when = suggestion.start === "schedule" ? suggestion.when : `When ${lowerFirst(suggestion.when)}`;
    setPrompt(`${when}, ${lowerFirst(suggestion.then)}.`);
    // Fill the composer; the person then picks how it starts (which opens that editor with this text).
    setShowStart(true);
  };

  const send = async () => {
    const text = prompt.trim();
    if (!text || sending || uploadingCount > 0) return;
    const kind = AUTOMATION_KINDS.find((k) => k.id === start);
    const { mode, effort, speed, target, connectors } = useComposerStore.getState();
    setSending(true);
    setError(null);
    const input: CreateTaskInput = { prompt: kind ? `Set up an automation (${kind.startTitle}). ${text}` : `Set up an automation. ${text}`, mode, effort, speed, target };
    if (connectors.length > 0) input.connectors = connectors;
    if (attachments.length > 0) input.attachments = attachments;
    try {
      const { task } = await createTask(input);
      reset();
      router.push(taskHref(task.id));
    } catch {
      setError("Couldn’t start the task. Try again.");
      setSending(false);
    }
  };

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const tooBig = files.find((file) => file.size > UPLOAD_MAX_BYTES);
    setError(tooBig ? `“${tooBig.name}” is larger than 100 MB and was not attached.` : null);
    setUploadingCount((n) => n + 1);
    try {
      for (const file of files.filter((f) => f.size <= UPLOAD_MAX_BYTES)) {
        const attached = await uploadAttachment(file);
        setAttachments((current) => [...current, attached]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "One of the files could not be uploaded.");
    } finally {
      setUploadingCount((n) => n - 1);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <PageShell bare className="items-center">
      <TopBar />
      <div className="mx-auto flex w-full min-w-0 max-w-full flex-1 flex-col items-center px-[16px] sm:max-w-[800px]">
        <h2 className="my-[clamp(32px,8vh,80px)] text-center font-serif text-[32px] font-normal leading-[40px] text-[var(--om-text-1)] max-sm:text-[28px]">What should run on its own?</h2>

        {start === "schedule" ? (
          <ScheduleEditor seedPrompt={prompt} onClose={closeEditor} />
        ) : start === "trigger" ? (
          <TriggerEditor seedPrompt={prompt} onClose={closeEditor} />
        ) : start === "advanced" ? (
          <AdvancedEditor onClose={closeEditor} />
        ) : (
          <>
        <div className="flex w-full flex-col rounded-[22px] bg-[var(--om-card)] shadow-[inset_0_0_0_1px_var(--om-shadow-highlight),inset_0_0_0_1px_var(--om-shadow-md)]">
          <div className="flex shrink-0 flex-wrap items-center gap-0 px-[6px] pb-[6px] pt-[6px]">
            <TargetPicker />
            <ProjectPicker />
          </div>
          <div className="flex min-h-[120px] shrink-0 flex-col justify-between gap-[14px] rounded-[22px] border border-[var(--om-border)] bg-[var(--om-surface)] shadow-[0_12px_32px_0_rgba(0,0,0,0.02)] pb-[12px] pl-[16px] pr-[12px] pt-[12px] transition-colors focus-within:border-[var(--om-border-strong)]">
            {attachments.length > 0 ? (
              <ul className="flex flex-wrap gap-[6px]">
                {attachments.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex h-[28px] max-w-[220px] items-center gap-[6px] rounded-[8px] bg-[var(--om-fill)] pl-[8px] pr-[4px] text-[13px] leading-[18px] text-[var(--om-text-1)]"
                  >
                    <Paperclip size={13} strokeWidth={1.8} className="shrink-0 text-[var(--om-icon-2)]" aria-hidden />
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                      className="flex h-[20px] w-[20px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none hover:bg-[var(--om-fill)]"
                    >
                      <X size={11} strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              autoFocus
              aria-label={`Describe a job for ${brand.agentNoun} to repeat`}
              placeholder={`Describe a job for ${brand.agentNoun} to repeat`}
              className="field-sizing-content max-h-[192px] min-h-[24px] w-full resize-none bg-transparent text-[15px] leading-[24px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[8px]">
                <PlusMenu onPickFiles={() => fileRef.current?.click()} />
                <ConnectorsMenu />
                <input ref={fileRef} type="file" multiple hidden onChange={(event) => void onFiles(event)} />
                <button
                  type="button"
                  aria-pressed="true"
                  onClick={() => router.push(AUTOMATIONS_HREF)}
                  title="Leave automation mode"
                  className="flex h-[30px] cursor-pointer items-center gap-[6px] rounded-[15px] border border-[#1A93FE59] bg-[var(--om-fill-accent)] px-[10px] text-[14px] font-medium leading-[20px] text-[var(--om-text-accent)] outline-none transition-opacity hover:opacity-90"
                >
                  <TriggerIcon size={15} />
                  Automations
                </button>
              </div>
              <div className="flex items-center gap-[14px]">
                <button type="button" aria-label="Dictate" className="flex cursor-pointer text-[var(--om-icon-2)] outline-none transition-colors hover:text-[var(--om-icon-1)]">
                  <Mic size={18} strokeWidth={1.7} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Send"
                  disabled={!canSend}
                  onClick={() => void send()}
                  className={cx(
                    "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[15px] outline-none transition-colors",
                    canSend ? "cursor-pointer bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90" : "bg-[#383838] text-[#7A7A7A]",
                  )}
                >
                  <ArrowUp size={15} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
        {error ? (
          <p role="alert" className="w-full px-[15px] pt-[8px] text-[13px] leading-[18px] text-[var(--om-danger)]">
            {error}
          </p>
        ) : null}

        {showStart ? (
          <div className="mt-[12px] flex w-full min-w-0 flex-col rounded-[22px] border border-[var(--om-border)] bg-[var(--om-surface)] shadow-[0_12px_32px_0_var(--om-shadow-xs)]">
            <div className="flex w-full items-center gap-[8px] pe-[12px] ps-[16px] pt-[12px]">
              <div className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Pick what starts it</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowStart(false)}
                className="flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]"
              >
                <X size={16} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div role="radiogroup" aria-label="Pick what starts it" className="grid w-full grid-cols-1 gap-[12px] p-[12px] md:grid-cols-3">
              {AUTOMATION_KINDS.map((kind) => {
                const active = start === kind.id;
                return (
                  <button
                    key={kind.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStart(active ? null : kind.id)}
                    className={cx(
                      "flex min-w-0 cursor-pointer flex-col items-start gap-[24px] rounded-[12px] border px-[16px] pb-[12px] pt-[16px] text-start outline-none transition-colors hover:bg-[var(--om-fill)]",
                      active ? "border-[var(--om-border-focus)] bg-[var(--om-fill)]" : "border-[var(--om-border)] focus-visible:border-[var(--om-border-focus)]",
                    )}
                  >
                    <span className="flex h-[16px] shrink-0 items-center gap-[4px] text-[var(--om-icon-1)]">
                      <StartIcon start={kind.id} size={16} />
                    </span>
                    <span className="flex w-full flex-col">
                      <span className="flex w-full items-center gap-[4px]">
                        <span className="min-w-0 break-words text-[14px] leading-[20px] text-[var(--om-text-1)]">{kind.startTitle}</span>
                        {kind.beta ? <span className="flex h-[20px] shrink-0 items-center rounded-[4px] bg-[var(--om-fill)] px-[4px] text-[12px] leading-[16px] text-[var(--om-text-2)]">Beta</span> : null}
                      </span>
                      <span className="w-full break-words text-[13px] leading-[18px] text-[var(--om-text-3)]">{kind.startDescription}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

          </>
        )}

        {start === "schedule" || start === "trigger" ? null : (
        <section className="mt-[16px] flex w-full min-w-0 flex-col gap-[12px] pb-[32px] pt-[16px]">
          <div className="flex items-center justify-between gap-[8px] px-[12px]">
            <h3 className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Ideas to start from</h3>
            <button
              type="button"
              aria-label="Show more ideas"
              onClick={() => setPage((p) => (p + 1) % pages)}
              className="flex size-[32px] cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]"
            >
              <RotateCcw size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className="-m-[4px] grid grid-cols-1 gap-[12px] p-[6px] md:grid-cols-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} onPick={pick} />
            ))}
          </div>
        </section>
        )}
      </div>
    </PageShell>
  );
}
