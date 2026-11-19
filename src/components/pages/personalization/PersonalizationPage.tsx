// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

import { ChevronRight, CircleHelp, Import } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { brand } from "@/config/brand";
import { cx } from "../cx";
import { PageShell, PrimaryButton } from "../ui";
import { PERSONALIZATION_LIMITS, samePersonalization, usePersonalization, type Personalization } from "../usePersonalization";
import { ImportMemory } from "./ImportMemory";
import { KnowledgePanel } from "./KnowledgePanel";

type Tab = "profile" | "knowledge";

const FIELD =
  "w-full rounded-[9px] border border-[var(--om-border-strong)] bg-transparent px-[11px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors placeholder:text-[var(--om-text-disabled)] hover:border-[var(--om-border-focus)] focus:border-[var(--om-border-focus)]";
const LABEL = "text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]";
const SECONDARY_BUTTON =
  "flex h-[33px] shrink-0 cursor-pointer items-center justify-center gap-[7px] rounded-[9px] border border-[var(--om-border-strong)] px-[13px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]";

function ImportIcon({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return <Import size={size} strokeWidth={strokeWidth} aria-hidden className="shrink-0" />;
}

export function PersonalizationPage() {
  const { saved, save, status, error } = usePersonalization();
  const [tab, setTab] = useState<Tab>("profile");
  /** Unsaved edits; null while the form mirrors what is stored. */
  const [draft, setDraft] = useState<Personalization | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();

  const form = draft ?? saved;
  const dirty = draft !== null && !samePersonalization(draft, saved);

  const edit = (field: keyof Personalization, value: string) => {
    setJustSaved(false);
    setDraft({ ...form, [field]: value });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || !draft) return;
    save(draft);
    setDraft(null);
    setJustSaved(true);
  };

  return (
    <PageShell title="Personalization">
      <div className="flex w-full flex-col items-start pb-[40px]">
        <div role="tablist" aria-label="Personalization" className="flex h-[41px] w-full shrink-0 gap-[22px] border-b border-[var(--om-border)]">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "profile"}
            onClick={() => setTab("profile")}
            className={cx(
              "flex h-[41px] cursor-pointer items-center border-b-2 text-[15px] leading-[20px] outline-none transition-colors",
              tab === "profile" ? "border-[var(--om-text-1)] font-medium text-[var(--om-text-1)]" : "border-transparent text-[var(--om-text-3)] hover:text-[var(--om-text-2)]",
            )}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "knowledge"}
            onClick={() => setTab("knowledge")}
            title={`Facts ${brand.agentNoun} has learned from your tasks`}
            className={cx(
              "flex h-[41px] cursor-pointer items-center gap-[6px] border-b-2 text-[15px] leading-[20px] outline-none transition-colors",
              tab === "knowledge" ? "border-[var(--om-text-1)] font-medium text-[var(--om-text-1)]" : "border-transparent text-[var(--om-text-3)] hover:text-[var(--om-text-2)]",
            )}
          >
            Knowledge
            <CircleHelp size={14} strokeWidth={1.8} className="text-[var(--om-icon-3)]" aria-hidden />
          </button>
        </div>

        {tab === "knowledge" ? (
          <div role="tabpanel" className="w-full">
            <KnowledgePanel />
          </div>
        ) : (
          <form role="tabpanel" onSubmit={submit} className="flex w-full flex-col items-start">
            <button
              type="button"
              onClick={() => setImporting((v) => !v)}
              aria-expanded={importing}
              className="mt-[23px] flex h-[66px] w-full shrink-0 cursor-pointer items-center gap-[12px] rounded-[14px] bg-[#262626] pl-[15px] pr-[18px] text-left outline-none transition-colors hover:bg-[#2A2A2A] focus-visible:ring-1 focus-visible:ring-[var(--om-border-focus)]"
            >
              <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--om-border)] bg-[#1F1F1F] text-[var(--om-icon-1)]">
                <ImportIcon size={18} strokeWidth={1.7} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Bring over what another assistant knows</span>
                <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Fill in this page from a summary your other AI writes about you.</span>
              </span>
              <ChevronRight size={14} strokeWidth={2} className={cx("shrink-0 text-[var(--om-icon-2)] transition-transform", importing && "rotate-90")} aria-hidden />
            </button>

            {importing ? (
              <div className="w-full">
                <ImportMemory onBack={() => setImporting(false)} onDone={() => setDraft(null)} />
              </div>
            ) : null}

            <div className="flex w-full gap-[15px] pt-[31px] max-md:flex-col">
              <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
                <label htmlFor={`${ids}-nickname`} className={LABEL}>
                  Nickname
                </label>
                <input
                  id={`${ids}-nickname`}
                  value={form.nickname}
                  onChange={(e) => edit("nickname", e.target.value)}
                  maxLength={PERSONALIZATION_LIMITS.nickname}
                  placeholder="Sam"
                  autoComplete="nickname"
                  className={cx(FIELD, "h-[33px]")}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
                <label htmlFor={`${ids}-occupation`} className={LABEL}>
                  Occupation
                </label>
                <input
                  id={`${ids}-occupation`}
                  value={form.occupation}
                  onChange={(e) => edit("occupation", e.target.value)}
                  maxLength={PERSONALIZATION_LIMITS.occupation}
                  placeholder="Operations lead"
                  autoComplete="organization-title"
                  className={cx(FIELD, "h-[33px]")}
                />
              </div>
            </div>

            <div className="flex w-full flex-col gap-[9px] pt-[20px]">
              <label htmlFor={`${ids}-about`} className={LABEL}>
                More about you
              </label>
              <textarea
                id={`${ids}-about`}
                ref={aboutRef}
                value={form.about}
                onChange={(e) => edit("about", e.target.value)}
                maxLength={PERSONALIZATION_LIMITS.about}
                placeholder="I run a small online shop from Lisbon and do most of my work in spreadsheets."
                className={cx(FIELD, "h-[135px] resize-none py-[10px]")}
              />
            </div>

            <p className="w-full pt-[22px] text-[13px] leading-[18px] text-[var(--om-text-disabled)]">{brand.agentNoun} uses this information to personalize responses across all tasks.</p>
            <div className="mt-[16px] h-px w-full shrink-0 bg-[var(--om-border)]" />

            <div className="flex w-full flex-col gap-[9px] pt-[30px]">
              <label htmlFor={`${ids}-instructions`} className={LABEL}>
                Custom Instructions
              </label>
              <textarea
                id={`${ids}-instructions`}
                value={form.instructions}
                onChange={(e) => edit("instructions", e.target.value)}
                maxLength={PERSONALIZATION_LIMITS.instructions}
                placeholder="Keep answers short. Use metric units and British spelling. Show sources for any numbers."
                className={cx(FIELD, "h-[126px] resize-none py-[10px]")}
              />
            </div>

            <div className="mt-[22px] flex w-full items-center justify-between gap-[12px]">
              <button
                type="button"
                onClick={(event) => {
                  setImporting(true);
                  // The panel opens at the top of the form, which may be scrolled out of view.
                  event.currentTarget.closest("main")?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cx(SECONDARY_BUTTON, "w-[135px] px-0")}
              >
                <ImportIcon size={14} strokeWidth={1.8} />
                Import memory
              </button>
              <div className="flex items-center gap-[8px]">
                <span role="status" className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
                  {status === "error" ? <span className="text-[var(--om-danger)]">{error ?? "Not saved"}</span> : justSaved && !dirty ? (status === "saving" ? "Saving…" : "Saved") : ""}
                </span>
                {dirty ? (
                  <>
                    <button type="button" onClick={() => setDraft(null)} className={SECONDARY_BUTTON}>
                      Cancel
                    </button>
                    <PrimaryButton type="submit" className="h-[33px] rounded-[9px] px-[16px] leading-[20px]">
                      Save
                    </PrimaryButton>
                  </>
                ) : null}
              </div>
            </div>
          </form>
        )}
      </div>
    </PageShell>
  );
}
