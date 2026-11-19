"use client";

/**
 * Import memory: the user copies a prompt into their other assistant, pastes the
 * transfer document it produces, and gets proposed profile fields and knowledge entries to accept.
 * The proposal comes from one model call through the user's agent (`POST /api/personalization/import`).
 */
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { brand } from "@/config/brand";
import { usePersonalization, type Personalization } from "@/components/pages/usePersonalization";
import { Button, DIVIDER, cn, useCopy } from "@/components/settings/ui";
import { TextArea } from "./KnowledgePanel";
import { addKnowledge, type KnowledgeDraft } from "./useKnowledge";

export const IMPORT_PROMPT =
  "I am moving to a different assistant. Write down everything you remember about me so it can start where you stop: what to call me, my job, where I live, the tools and languages I use, what I am working on, how I like replies (length, tone, layout), and any rules I have given you. Plain text, one item per line. Do not include passwords, keys or other secrets.";

const FIELD_LABELS: Record<keyof Personalization, string> = { nickname: "Nickname", occupation: "Occupation", about: "More about you", instructions: "Custom instructions" };

interface Proposal {
  profile: Partial<Personalization>;
  entries: KnowledgeDraft[];
  room: number;
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="mt-[2px] size-[14px] shrink-0 cursor-pointer accent-[var(--om-btn-accent)]" />;
}

export function ImportMemory({ onBack, onDone }: { onBack: () => void; onDone?: () => void }) {
  const { saved, update } = usePersonalization();
  const [copied, copy] = useCopy();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [pickedFields, setPickedFields] = useState<Set<keyof Personalization>>(new Set());
  const [pickedEntries, setPickedEntries] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<string | null>(null);

  const analyse = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/personalization/import", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ text }) });
      const body = (await res.json().catch(() => ({}))) as Partial<Proposal> & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const next: Proposal = { profile: body.profile ?? {}, entries: body.entries ?? [], room: body.room ?? 0 };
      setProposal(next);
      // Pre-select fields that are empty today and every entry that fits.
      setPickedFields(new Set((Object.keys(next.profile) as (keyof Personalization)[]).filter((f) => !saved[f].trim())));
      setPickedEntries(new Set(next.entries.map((_, i) => i).slice(0, next.room)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the document.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    const patch: Partial<Personalization> = {};
    for (const f of pickedFields) {
      const value = proposal.profile[f];
      if (!value) continue;
      // "More about you" and instructions are added to, not overwritten.
      patch[f] = (f === "about" || f === "instructions") && saved[f].trim() ? `${saved[f].trim()}\n\n${value}` : value;
    }
    if (Object.keys(patch).length) update(patch);
    let added = 0;
    const failures: string[] = [];
    for (const i of [...pickedEntries].sort((a, b) => a - b)) {
      try {
        await addKnowledge(proposal.entries[i]);
        added++;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : proposal.entries[i].name);
      }
    }
    setBusy(false);
    const fields = Object.keys(patch).length;
    setResult(`Imported ${fields} profile field${fields === 1 ? "" : "s"} and ${added} knowledge entr${added === 1 ? "y" : "ies"}.${failures.length ? ` ${failures[0]}` : ""}`);
    setProposal(null);
    setText("");
    onDone?.();
  };

  const toggle = <T,>(setter: (fn: (prev: Set<T>) => Set<T>) => void, value: T, on: boolean) =>
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });

  return (
    <div className="flex flex-col pt-[21px]">
      <button type="button" onClick={onBack} className="flex cursor-pointer items-center gap-[6px] self-start rounded-[6px] text-[var(--om-text-1)] outline-none hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-2)]">
        <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
        <span className="text-[15px] font-medium leading-[20px]">Bring over what another assistant knows</span>
      </button>

      {result ? <div className={cn("mt-[16px] rounded-[10px] border px-[12px] py-[10px] text-[13px] leading-[18px] text-[var(--om-text-1)]", DIVIDER)}>{result}</div> : null}

      {proposal ? (
        <div className="flex flex-col pt-[18px]">
          <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Choose what to bring over</div>
          <p className="pt-[4px] text-[13px] leading-[18px] text-[var(--om-text-3)]">Only the items you tick are saved.</p>

          {Object.keys(proposal.profile).length ? (
            <ul className="flex flex-col gap-[8px] pt-[14px]">
              {(Object.keys(proposal.profile) as (keyof Personalization)[]).map((f) => (
                <li key={f} className={cn("flex gap-[10px] rounded-[10px] border px-[12px] py-[10px]", DIVIDER)}>
                  <Check checked={pickedFields.has(f)} onChange={(v) => toggle(setPickedFields, f, v)} label={`Import ${FIELD_LABELS[f]}`} />
                  <div className="flex min-w-0 flex-col gap-[2px]">
                    <div className="text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">
                      {FIELD_LABELS[f]}
                      {saved[f].trim() ? <span className="font-normal text-[var(--om-text-3)]">{f === "about" || f === "instructions" ? " (added to yours)" : " (replaces yours)"}</span> : null}
                    </div>
                    <div className="whitespace-pre-line text-[13px] leading-[18px] text-[var(--om-text-2)]">{proposal.profile[f]}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {proposal.entries.length ? (
            <>
              <div className="pt-[16px] text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">Knowledge {proposal.room < proposal.entries.length ? `(room for ${proposal.room} more)` : ""}</div>
              <ul className="flex flex-col gap-[8px] pt-[8px]">
                {proposal.entries.map((e, i) => (
                  <li key={`${e.name}-${i}`} className={cn("flex gap-[10px] rounded-[10px] border px-[12px] py-[10px]", DIVIDER)}>
                    <Check checked={pickedEntries.has(i)} onChange={(v) => toggle(setPickedEntries, i, v)} label={`Import ${e.name}`} />
                    <div className="flex min-w-0 flex-col gap-[2px]">
                      <div className="text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">{e.name}</div>
                      {e.whenToUse ? <div className="text-[12px] leading-[16px] text-[var(--om-text-3)]">When: {e.whenToUse}</div> : null}
                      <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{e.content}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {!Object.keys(proposal.profile).length && !proposal.entries.length ? <p className="pt-[14px] text-[13px] leading-[18px] text-[var(--om-text-3)]">Nothing in that reply was useful to keep.</p> : null}
          {error ? <div className="pt-[10px] text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
          <div className="flex justify-end gap-[7px] pt-[16px]">
            <Button onClick={() => setProposal(null)}>Back</Button>
            <Button variant="primary" disabled={busy || (pickedFields.size === 0 && pickedEntries.size === 0)} onClick={() => void apply()}>
              {busy ? "Importing…" : "Import selected"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="pt-[20px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">1. Paste this prompt into your other assistant</div>
          <div className={cn("mt-[8px] flex items-start gap-[12px] rounded-[12px] border bg-[var(--om-bg-sidebar)] px-[14px] py-[12px]", DIVIDER)}>
            <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-[var(--om-text-2)]">{IMPORT_PROMPT}</p>
            <Button onClick={() => copy(IMPORT_PROMPT)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          <label className="flex flex-col gap-[8px] pt-[18px]">
            <span className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">2. Put its reply here</span>
            <TextArea value={text} onChange={(e) => setText(e.target.value)} maxLength={60_000} placeholder="Its reply" className="h-[150px]" />
          </label>
          <p className="pt-[10px] text-[13px] leading-[18px] text-[var(--om-text-4)]">{brand.name} reads it once and proposes profile fields and knowledge entries. You choose what to keep.</p>
          {error ? <div className="pt-[10px] text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
          <div className="flex justify-end gap-[7px] pt-[16px]">
            <Button onClick={onBack}>Cancel</Button>
            <Button variant="primary" disabled={text.trim().length < 20 || busy} onClick={() => void analyse()}>
              {busy ? "Reading…" : "Continue"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
