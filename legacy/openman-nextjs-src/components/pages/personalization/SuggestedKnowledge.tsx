// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * "Suggested knowledge" card for the task view. When a task has completed, asks once for zero to two
 * proposed entries (`POST /api/personalization/suggest`, one cheap model call through the agent) and lets
 * the user accept or dismiss each. Renders nothing when there is nothing to offer.
 *
 * Mount: `<SuggestedKnowledge taskId={task.id} status={task.status} />` under the last agent message.
 */
import { useEffect, useState } from "react";
import { useUI } from "@/lib/ui-store";
import { Button, DIVIDER, cn } from "@/components/settings/ui";
import { addKnowledge, type KnowledgeDraft } from "./useKnowledge";

const asked = new Set<string>();

async function post(body: Record<string, unknown>): Promise<KnowledgeDraft[]> {
  const res = await fetch("/api/personalization/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { suggestions?: KnowledgeDraft[] };
  return json.suggestions ?? [];
}

export function SuggestedKnowledge({ taskId, status, className }: { taskId: string; status: string; className?: string }) {
  const [items, setItems] = useState<KnowledgeDraft[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const open = useUI((s) => s.open);

  useEffect(() => {
    if (status !== "completed" || asked.has(taskId)) return;
    asked.add(taskId);
    let live = true;
    void post({ taskId }).then((list) => {
      if (live) setItems(list);
    });
    return () => {
      live = false;
    };
  }, [taskId, status]);

  const finish = (name: string) => {
    setItems((prev) => prev.filter((i) => i.name !== name));
    void post({ taskId, done: name });
  };

  const accept = async (entry: KnowledgeDraft) => {
    setError(null);
    try {
      await addKnowledge(entry);
      setSaved((prev) => [...prev, entry.name]);
      finish(entry.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  };

  if (items.length === 0 && saved.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-[8px] rounded-[12px] border bg-[var(--om-bg-sidebar)] px-[14px] py-[12px]", DIVIDER, className)}>
      <div className="flex items-center justify-between gap-[12px]">
        <div className="text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">Suggested knowledge</div>
        <button type="button" onClick={() => open("settings", { tab: "personalization", section: "knowledge" })} className="cursor-pointer text-[13px] leading-[18px] text-[var(--om-text-3)] underline-offset-2 hover:underline">
          View in knowledge
        </button>
      </div>
      {items.map((entry) => (
        <div key={entry.name} className="flex items-start justify-between gap-[14px]">
          <div className="flex min-w-0 flex-col gap-[2px]">
            <div className="text-[13px] leading-[18px] text-[var(--om-text-1)]">{entry.name}</div>
            {entry.whenToUse ? <div className="text-[12px] leading-[16px] text-[var(--om-text-3)]">When: {entry.whenToUse}</div> : null}
            <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{entry.content}</div>
          </div>
          <div className="flex shrink-0 gap-[6px]">
            <Button onClick={() => finish(entry.name)}>Dismiss</Button>
            <Button variant="primary" onClick={() => void accept(entry)}>
              Accept
            </Button>
          </div>
        </div>
      ))}
      {saved.length ? <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Saved to knowledge: {saved.join(", ")}</div> : null}
      {error ? <div className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
    </div>
  );
}
