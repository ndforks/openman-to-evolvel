"use client";

/**
 * Batch research: the confirm card (sub-task count and a dollar range before anything runs) and the
 * per-item progress while sub-agents work in parallel batches.
 */
import { useState } from "react";
import { Check, CircleDashed, Loader2, Telescope, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { WIDE_RESEARCH_GO } from "@/lib/generators/registry";
import type { ResearchState } from "@/lib/generators/types";

const usd = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`);

async function send(taskId: string, text: string) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, mode: "queue" }) });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not reach the task.");
}

export function WideResearchCard({ taskId, research, onChange, className }: { taskId: string; research: ResearchState; onChange?: () => void; className?: string }) {
  const [busy, setBusy] = useState<"go" | "cancel" | null>(null);
  const [sent, setSent] = useState<"go" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { plan, estimate, phase } = research;
  if (!plan || plan.mode !== "wide") return null;
  const total = plan.items.length;
  const done = new Set(research.done);
  const running = new Set(research.running);
  const failed = new Set(research.failed);
  const awaiting = phase === "awaiting-confirmation" && sent !== "go";

  const act = async (what: "go" | "cancel") => {
    setBusy(what);
    setError(null);
    try {
      await send(taskId, what === "go" ? WIDE_RESEARCH_GO : "Cancel the batch research. Do not start any sub-agents.");
      setSent(what);
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the task.");
    } finally {
      setBusy(null);
    }
  };

  const items = showAll ? plan.items : plan.items.slice(0, 12);
  return (
    <section aria-label="Batch research" className={cn("rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[14px]", className)}>
      <div className="flex items-start gap-[10px]">
        <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--om-fill)] text-[#25ba3b] dark:text-[#5eb92d]">
          <Telescope size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Batch research · {plan.title}</p>
          <p className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
            {total} items researched side by side · {plan.fields.length} fields per item · combined into one {plan.deliverable}
          </p>
        </div>
      </div>

      {awaiting && sent !== "cancel" ? (
        <div className="mt-[12px] rounded-[10px] bg-[var(--om-fill-subtle)] p-[12px]">
          {estimate ? (
            <p className="text-[13px] leading-[20px] text-[var(--om-text-1)]" title={estimate.basis}>
              Likely cost <span className="font-semibold">{usd(estimate.lowUsd)} to {usd(estimate.highUsd)}</span> in credits: {estimate.subtasks} helpers running {estimate.model.replace(/^claude-/, "").replace(/-(\d)-(\d)$/, " $1.$2")}.
            </p>
          ) : null}
          <p className="mt-[2px] text-[12px] leading-[18px] text-[var(--om-text-3)]">Collected for each item: {plan.fields.join(", ")}</p>
          <div className="mt-[10px] flex gap-[8px]">
            <button type="button" disabled={!!busy} onClick={() => void act("go")} className="flex h-[32px] cursor-pointer items-center gap-[6px] rounded-[8px] bg-[var(--om-btn-primary)] px-[14px] text-[13px] font-medium text-[var(--om-text-inverse)] disabled:opacity-60">
              {busy === "go" ? <Loader2 size={14} className="animate-spin" /> : null}
              Run all {total}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void act("cancel")} className="h-[32px] cursor-pointer rounded-[8px] border border-[var(--om-border)] px-[14px] text-[13px] text-[var(--om-text-1)] hover:bg-[var(--om-fill)] disabled:opacity-60">
              Cancel
            </button>
          </div>
          {error ? <p className="mt-[8px] text-[13px] text-[var(--om-danger)]">{error}</p> : null}
        </div>
      ) : sent === "cancel" ? (
        <p className="mt-[10px] text-[13px] text-[var(--om-text-3)]">Cancelled before anything ran.</p>
      ) : (
        <div className="mt-[12px]">
          <div className="flex items-center justify-between text-[13px] text-[var(--om-text-2)]">
            <span>{phase === "done" ? "Done" : phase === "merging" ? "Combining results" : running.size ? `${running.size} running at once` : "Getting ready"}</span>
            <span className="tabular-nums">
              {done.size} / {total}
              {failed.size ? ` · ${failed.size} failed` : ""}
            </span>
          </div>
          <div className="mt-[6px] h-[4px] overflow-hidden rounded-full bg-[var(--om-fill-strong)]">
            <div className="h-full rounded-full bg-[#25ba3b] transition-[width] duration-500" style={{ width: `${Math.round(((done.size + failed.size) / Math.max(1, total)) * 100)}%` }} />
          </div>
        </div>
      )}

      <ul className="mt-[12px] grid grid-cols-1 gap-x-[16px] gap-y-[4px] sm:grid-cols-2">
        {items.map((item) => {
          const s = done.has(item.id) ? "done" : failed.has(item.id) ? "failed" : running.has(item.id) ? "running" : "pending";
          return (
            <li key={item.id} className="flex min-w-0 items-center gap-[8px] text-[13px] leading-[20px]">
              {s === "done" ? (
                <Check size={14} className="shrink-0 text-[var(--om-success)]" />
              ) : s === "failed" ? (
                <X size={14} className="shrink-0 text-[var(--om-danger)]" />
              ) : s === "running" ? (
                <Loader2 size={14} className="shrink-0 animate-spin text-[var(--om-icon-2)]" />
              ) : (
                <CircleDashed size={14} className="shrink-0 text-[var(--om-icon-3)]" />
              )}
              <span className={cn("truncate", s === "pending" ? "text-[var(--om-text-3)]" : "text-[var(--om-text-1)]")}>{item.name}</span>
            </li>
          );
        })}
      </ul>
      {plan.items.length > 12 ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-[6px] cursor-pointer text-[13px] text-[var(--om-text-accent)]">
          {showAll ? "Show less" : `See all ${plan.items.length}`}
        </button>
      ) : null}
    </section>
  );
}
