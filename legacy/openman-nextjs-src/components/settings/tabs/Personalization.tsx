// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Settings → Personalization.
 * Profile fields save as you type to `/api/personalization` (sent with every task and mirrored into the
 * agent's USER.md); the Knowledge tab works on `/api/knowledge`.
 */
import { useState, type ReactNode } from "react";
import { BrainCircuit } from "lucide-react";
import { brand } from "@/config/brand";
import { ImportMemory } from "@/components/pages/personalization/ImportMemory";
import { KnowledgePanel, TextArea } from "@/components/pages/personalization/KnowledgePanel";
import { PERSONALIZATION_LIMITS, usePersonalization } from "@/components/pages/usePersonalization";
import { Button, ChevronRight, DIVIDER, HelpGlyph, TextInput, cn } from "@/components/settings/ui";

type TabId = "profile" | "knowledge";

const LABEL = "text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]";
const FIELD = "h-[36px] w-full placeholder:text-[var(--om-text-disabled)]";

/** 36px outline button at the bottom of the Profile tab (min 72px wide, 12px side padding, 14/20). */
function WideButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button className="h-[36px] min-w-[72px] gap-[6px] px-[12px] leading-[20px]" onClick={onClick}>
      {children}
    </Button>
  );
}

function MemoryGlyph() {
  return (
    <BrainCircuit size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
  );
}

/** Where the profile is: saved in the account, and copied into the agent's own USER.md. */
function SaveStatus() {
  const { status, error, mirror, loaded } = usePersonalization();
  let text = "";
  if (!loaded) text = "Loading…";
  else if (status === "saving") text = "Saving…";
  else if (status === "error") text = error ? `Not saved: ${error}` : "Not saved";
  else if (mirror?.state === "pending") text = "Saved. Updating the agent's memory…";
  else if (mirror?.state === "synced") text = "Saved and synced to the agent's memory";
  else if (mirror?.state === "failed") text = "Saved. The agent computer could not be updated; new tasks still receive it.";
  else if (status === "saved") text = "Saved";
  return (
    <span role="status" className={cn("text-[13px] leading-[18px]", status === "error" ? "text-[var(--om-danger)]" : "text-[var(--om-text-4)]")}>
      {text}
    </span>
  );
}

export default function PersonalizationTab({ initialTab = "profile" }: { initialTab?: TabId }) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [importing, setImporting] = useState(false);
  // The same profile the Personalization page edits (More > Personalization); here every keystroke is saved.
  const { saved, update } = usePersonalization();
  const { nickname, occupation, about, instructions } = saved;
  const setNickname = (value: string) => update({ nickname: value });
  const setOccupation = (value: string) => update({ occupation: value });
  const setAbout = (value: string) => update({ about: value });
  const setInstructions = (value: string) => update({ instructions: value });

  const tabs: { id: TabId; label: string; help?: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "knowledge", label: "Knowledge", help: `Facts and habits ${brand.name} keeps and brings up when a task calls for them.` },
  ];

  return (
    <div className="flex flex-col">
      <div className={cn("flex flex-col gap-[4px] border-b pb-[16px] pt-[34px]", DIVIDER)}>
        <h2 className="text-[24px] font-medium leading-[30px] text-[var(--om-text-1)]">Personalization</h2>
        <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Tell {brand.name} about yourself and review what it has learned</p>
      </div>

      <div role="tablist" aria-label="Personalization" className={cn("mt-[24px] flex flex-wrap gap-x-[24px] border-b", DIVIDER)}>
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t.id);
                setImporting(false);
              }}
              className={cn(
                "-mb-px flex cursor-pointer items-center gap-[4px] whitespace-nowrap border-b-2 py-[10px] text-[14px] leading-[20px] outline-none transition-colors duration-200",
                active ? "border-[var(--om-btn-primary)] font-medium text-[var(--om-text-1)]" : "border-transparent text-[var(--om-text-3)] hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-2)]",
              )}
            >
              {t.label}
              {t.help ? (
                <span title={t.help} className="flex">
                  <HelpGlyph />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "knowledge" ? <KnowledgePanel /> : null}

      {tab === "profile" && importing ? <ImportMemory onBack={() => setImporting(false)} /> : null}

      {tab === "profile" && !importing ? (
        <>
          <div className="flex flex-col gap-[16px] py-[16px]">
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="my-[8px] flex shrink-0 cursor-pointer items-center justify-between gap-[16px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)] p-[16px] text-left outline-none transition-shadow duration-200 ease-out hover:shadow-[0_1px_2px_0_var(--om-shadow-sm),0_2px_4px_0_var(--om-shadow-sm)] focus-visible:border-[var(--om-border-focus)]"
            >
              <span className="flex min-w-0 gap-[12px]">
                <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--om-border)] bg-[var(--om-surface)] text-[var(--om-icon-1)]">
                  <MemoryGlyph />
                </span>
                <span className="flex min-w-0 flex-col items-start">
                  <span className="text-[14px] font-medium leading-[21px] text-[var(--om-text-1)]">Bring your history from another assistant</span>
                  <span className="text-[13px] leading-[19.5px] text-[var(--om-text-3)]">Paste an export from ChatGPT, Claude or similar and we fill in your profile from it.</span>
                </span>
              </span>
              <ChevronRight size={16} />
            </button>

            <div className="flex shrink-0 items-start gap-[16px]">
              <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <span className={LABEL}>What to call you</span>
                <TextInput value={nickname} maxLength={PERSONALIZATION_LIMITS.nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Sam" autoComplete="off" className={FIELD} />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-[8px]">
                <span className={LABEL}>Your work</span>
                <TextInput value={occupation} maxLength={PERSONALIZATION_LIMITS.occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Founder, nurse, data engineer…" autoComplete="off" className={FIELD} />
              </label>
            </div>

            <label className="flex flex-col gap-[8px]">
              <span className={LABEL}>Background</span>
              <TextArea value={about} maxLength={PERSONALIZATION_LIMITS.about} onChange={(e) => setAbout(e.target.value)} placeholder="Where you are, what you work on, tools you use every day." className="min-h-[130px]" />
            </label>
            <p className="text-[13px] leading-[19.5px] text-[var(--om-text-disabled)]">Every new task starts with this in mind.</p>

            <div className="mb-[8px] w-full shrink-0 border-t border-[var(--om-border)]" />

            <label className="flex flex-col gap-[8px]">
              <span className={LABEL}>House rules</span>
              <TextArea value={instructions} maxLength={PERSONALIZATION_LIMITS.instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={`Standing orders for ${brand.name}, e.g. “Use metric units. Link every source.”`} className="min-h-[130px]" />
            </label>
          </div>
          <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-[16px] bg-[var(--om-bg)] py-[24px]">
            <WideButton onClick={() => setImporting(true)}>Import history</WideButton>
            <SaveStatus />
          </div>
        </>
      ) : null}
    </div>
  );
}
