"use client";

/**
 * Knowledge: entries on `/api/knowledge` (name, when to use, content) with add, edit, delete, search,
 * per-entry and global "Use knowledge" switches, and the entry limit. Used by Settings > Personalization
 * and the Personalization page.
 */
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent, type TextareaHTMLAttributes } from "react";
import { brand } from "@/config/brand";
import { usePersonalization } from "@/components/pages/usePersonalization";
import { Button, DIVIDER, TextInput, Toggle, cn } from "@/components/settings/ui";
import { addKnowledge, editKnowledge, removeKnowledge, useKnowledge, type KnowledgeDraft, type KnowledgeEntry } from "./useKnowledge";

const LABEL = "text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]";
const EMPTY_DRAFT: KnowledgeDraft = { name: "", whenToUse: "", content: "" };

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full shrink-0 resize-none rounded-[8px] border border-[var(--om-btn-border)] bg-transparent px-[12px] py-[8px] text-[14px] leading-[22px] text-[var(--om-text-1)] outline-none transition-colors placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]",
        className,
      )}
      {...props}
    />
  );
}

/** Name / when to use / content form, for adding, editing, or accepting a proposed entry. */
export function KnowledgeForm({ initial, submitLabel, onSubmit, onCancel }: { initial?: KnowledgeDraft; submitLabel: string; onSubmit: (draft: KnowledgeDraft) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<KnowledgeDraft>(initial ?? EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = draft.name.trim() !== "" && draft.content.trim() !== "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: draft.name.trim(), whenToUse: draft.whenToUse.trim(), content: draft.content.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={cn("flex flex-col gap-[10px] rounded-[12px] border bg-[var(--om-bg-sidebar)] p-[14px]", DIVIDER)}>
      <label className="flex flex-col gap-[6px]">
        <span className={LABEL}>Name of the knowledge</span>
        <TextInput autoFocus value={draft.name} maxLength={200} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Weekly report format" className="h-[32px] w-full" />
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className={LABEL}>When to use this knowledge</span>
        <TextInput value={draft.whenToUse} maxLength={2000} onChange={(e) => setDraft({ ...draft, whenToUse: e.target.value })} placeholder="When I ask for a weekly report" className="h-[32px] w-full" />
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className={LABEL}>Content of the knowledge</span>
        <TextArea value={draft.content} maxLength={20_000} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Start with a three-line summary, then a table of numbers, then risks." className="h-[96px]" />
      </label>
      {error ? <div className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
      <div className="flex justify-end gap-[7px]">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function EntryRow({ entry, globalOff }: { entry: KnowledgeEntry; globalOff: boolean }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [error, setError] = useState<string | null>(null);

  if (mode === "edit") {
    return (
      <li className="py-[10px]">
        <KnowledgeForm
          initial={{ name: entry.name, whenToUse: entry.whenToUse, content: entry.content }}
          submitLabel="Save"
          onCancel={() => setMode("view")}
          onSubmit={async (draft) => {
            await editKnowledge(entry.id, draft);
            setMode("view");
          }}
        />
      </li>
    );
  }

  return (
    <li className={cn("flex items-start gap-[14px] border-b border-[var(--om-border)] py-[12px]", globalOff && "opacity-60")}>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{entry.name}</div>
        {entry.whenToUse ? <div className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">When: {entry.whenToUse}</div> : null}
        <div className="line-clamp-2 whitespace-pre-line text-[13px] leading-[18px] text-[var(--om-text-2)]">{entry.content}</div>
        {error ? <div className="text-[12px] leading-[16px] text-[var(--om-danger)]">{error}</div> : null}
      </div>
      {mode === "confirm" ? (
        <div className="flex shrink-0 items-center gap-[6px]">
          <Button onClick={() => setMode("view")}>Cancel</Button>
          <Button variant="danger" onClick={() => void removeKnowledge(entry.id).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not delete."))}>
            Delete
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-[6px] pt-[2px]">
          <Toggle checked={entry.enabled} label={`Use ${entry.name}`} onCheckedChange={(next) => void editKnowledge(entry.id, { enabled: next }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))} />
          <button type="button" aria-label={`Edit ${entry.name}`} title="Edit" onClick={() => setMode("edit")} className="ml-[6px] flex size-[24px] cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]">
            <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Delete ${entry.name}`} title="Delete" onClick={() => setMode("confirm")} className="flex size-[24px] cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]">
            <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

export function KnowledgePanel() {
  const { entries, limit, loaded, error } = useKnowledge();
  const { useKnowledge: globalOn, setUseKnowledge } = usePersonalization();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const full = entries.length >= limit;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => `${e.name}\n${e.whenToUse}\n${e.content}`.toLowerCase().includes(q));
  }, [entries, query]);

  return (
    <div className="flex flex-col pt-[21px]">
      <div className="flex items-start justify-between gap-[24px]">
        <p className="min-w-0 text-[13px] leading-[18px] text-[var(--om-text-3)]">
          Short notes on how you like things done. {brand.name} pulls in the ones that fit the task at hand. Up to {limit} entries.
        </p>
        {adding ? null : (
          <Button onClick={() => setAdding(true)} disabled={full} title={full ? `You have ${limit} entries, the most allowed. Delete one to add another.` : undefined} className="px-[10px]">
            <Plus size={12} strokeWidth={2} aria-hidden="true" />
            Add
          </Button>
        )}
      </div>

      <div className={cn("mt-[16px] flex items-center justify-between gap-[24px] rounded-[12px] border bg-[var(--om-bg-sidebar)] px-[14px] py-[12px]", DIVIDER)}>
        <div className="flex min-w-0 flex-col gap-[2px]">
          <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Use knowledge</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Turn off to keep every entry out of your tasks until you switch it back on.</div>
        </div>
        <Toggle checked={globalOn} onCheckedChange={setUseKnowledge} label="Use knowledge" />
      </div>

      {adding ? (
        <div className="pt-[14px]">
          <KnowledgeForm
            submitLabel="Add"
            onCancel={() => setAdding(false)}
            onSubmit={async (draft) => {
              await addKnowledge(draft);
              setAdding(false);
            }}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-[10px] pt-[16px]">
        <label className="flex h-[31px] min-w-0 flex-1 items-center gap-[8px] rounded-[8px] border border-[var(--om-border-strong)] px-[10px] transition-colors focus-within:border-[var(--om-border-focus)]">
          <Search size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[var(--om-icon-2)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search knowledge" aria-label="Search knowledge" className="min-w-0 flex-1 bg-transparent text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-4)]" />
        </label>
        <span className={cn("shrink-0 text-[13px] leading-[18px] tabular-nums", full ? "text-[var(--om-danger)]" : "text-[var(--om-text-3)]")}>
          {entries.length} / {limit}
        </span>
      </div>

      {error ? <div className="pt-[12px] text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}

      {loaded && entries.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-[4px] pt-[44px] text-center">
          <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Nothing saved yet</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Entries appear as {brand.name} learns from your tasks. You can also write one with Add.</div>
        </div>
      ) : null}
      {entries.length > 0 && shown.length === 0 ? <div className="pt-[30px] text-center text-[13px] leading-[18px] text-[var(--om-text-3)]">No knowledge matches “{query.trim()}”.</div> : null}

      {shown.length > 0 ? (
        <ul className="flex flex-col pt-[6px]">
          {shown.map((entry) => (
            <EntryRow key={entry.id} entry={entry} globalOff={!globalOn} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
