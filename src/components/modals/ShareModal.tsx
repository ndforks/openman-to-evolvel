"use client";

/**
 * Share panel for a task: who can open it, and a button that copies its link.
 * It drops down from the task header's Share button.
 * Backed by `/api/shares`: "Anyone with the link" creates (or re-opens) the task's `/share/<token>` link, "Private" closes it.
 * The choice is also mirrored into the `share.tasks` preference, which Settings > Data controls lists.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Check, CircleHelp, Globe, Link2, Lock, type LucideIcon } from "lucide-react";
import { usePref } from "@/components/settings/prefs";
import { useCopy } from "@/components/settings/ui";
import { ModalShell, cn } from "./ModalShell";

export type ShareVisibility = "private" | "public";

export interface ShareEntry {
  visibility: ShareVisibility;
  title: string;
  url: string;
  /** ISO time of the last change. */
  updatedAt: string;
}

/** Every share choice lives in one preference, keyed by task id. Settings → Data controls reads the same key. */
export const SHARE_PREF_KEY = "share.tasks";
export const SHARE_EMPTY: Record<string, ShareEntry> = {};

const PANEL_WIDTH = 400;
const EDGE = 8;

interface ShareAnswer {
  share: { token: string; visibility: ShareVisibility } | null;
  url: string | null;
}

async function shareRequest(input: RequestInfo, init?: RequestInit): Promise<ShareAnswer> {
  const res = await fetch(input, { cache: "no-store", ...init });
  if (!res.ok) {
    let message = "Sharing did not go through.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Not JSON.
    }
    throw new Error(message);
  }
  return (await res.json()) as ShareAnswer;
}

/** Where the panel goes: under the header's Share button, right edges aligned. Null when no such button is on screen. */
function anchorStyle(): CSSProperties | null {
  if (typeof document === "undefined") return null;
  const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-app-root] main button")).filter((button) => {
    const name = button.getAttribute("aria-label") ?? button.textContent?.trim();
    return name === "Share" && button.getBoundingClientRect().width > 0;
  });
  const trigger = triggers[0];
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(rect.right - width, window.innerWidth - width - EDGE));
  return { left, top: rect.bottom + 4 };
}

type Tab = "share";

const CHOICES: { value: ShareVisibility; label: string; description: string; icon: LucideIcon }[] = [
  { value: "private", label: "Private", description: "Nobody else can open it", icon: Lock },
  { value: "public", label: "Anyone with the link", description: "Viewers can watch and replay it without signing in", icon: Globe },
];

export function ShareModal({ taskId, url, title }: { taskId?: string; url?: string; title?: string }) {
  const [, setEntries] = usePref<Record<string, ShareEntry>>(SHARE_PREF_KEY, SHARE_EMPTY);
  const [copied, copy] = useCopy();
  const [tab, setTab] = useState<Tab>("share");
  // Measured once, when the panel opens.
  const [anchor] = useState(anchorStyle);

  const key = taskId ?? url ?? "current";
  const ownLink = url ?? (typeof window === "undefined" ? "" : taskId ? `${window.location.origin}/app/task/${taskId}` : window.location.href);
  const [visibility, setVisibility] = useState<ShareVisibility | null>(taskId ? null : "private");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remember = (next: ShareVisibility, link: string) =>
    setEntries((prev) => ({ ...prev, [key]: { visibility: next, title: title ?? "Untitled task", url: link, updatedAt: new Date().toISOString() } }));

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    shareRequest(`/api/shares?taskId=${encodeURIComponent(taskId)}`)
      .then((answer) => {
        if (!alive) return;
        setVisibility(answer.share?.visibility ?? "private");
        setShareUrl(answer.url);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setVisibility("private");
        setError(err instanceof Error ? err.message : "Sharing is unavailable.");
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  const choose = async (next: ShareVisibility): Promise<string | null> => {
    if (!taskId) return null;
    setBusy(true);
    setError(null);
    const prev = visibility;
    setVisibility(next);
    try {
      const answer = await shareRequest("/api/shares", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId, visibility: next }) });
      setShareUrl(answer.url);
      remember(next, answer.url ?? ownLink);
      return answer.url;
    } catch (err) {
      setVisibility(prev);
      setError(err instanceof Error ? err.message : "Sharing did not go through.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** Public: the share link (made public first if it is not yet). Private: the task's own address. */
  const copyLink = async () => {
    if (visibility === "public") {
      const link = shareUrl ?? (await choose("public"));
      if (link) copy(link);
      return;
    }
    copy(ownLink);
  };
  const link = visibility === "public" && shareUrl ? shareUrl : ownLink;

  return (
    <ModalShell
      title="Share"
      closeButton={false}
      overlayClassName="bg-transparent backdrop-blur-none"
      style={anchor ?? undefined}
      className={cn(
        "flex w-[400px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] shadow-[0_12px_32px_#00000073]",
        anchor ? "left-auto top-auto translate-x-0 translate-y-0" : "top-[52px] translate-y-0",
      )}
    >
      <div role="tablist" aria-label="Share" className="flex h-[46px] shrink-0 items-stretch gap-[22px] border-b border-[var(--om-border)] px-4">
        {(["share"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "relative flex cursor-pointer items-center text-[14px] leading-5 outline-none transition-colors",
              tab === id ? "font-medium text-[var(--om-text-1)]" : "text-[var(--om-text-3)] hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-2)]",
            )}
          >
            Share
            {tab === id ? <span aria-hidden="true" className="absolute inset-x-0 bottom-[-1px] h-[2px] rounded-full bg-[var(--om-text-1)]" /> : null}
          </button>
        ))}
        <span className="flex-1" />
        <a href="/features" target="_blank" rel="noreferrer" aria-label="About sharing" title="About sharing" className="flex items-center text-[var(--om-icon-3)] outline-none transition-colors hover:text-[var(--om-icon-2)] focus-visible:text-[var(--om-icon-2)]">
          <CircleHelp size={16} strokeWidth={1.7} aria-hidden="true" />
        </a>
      </div>

      {tab === "share" ? (
        <div role="tabpanel" className="flex flex-col px-4 pb-4 pt-[10px]">
          <div role="radiogroup" aria-label="Who can open this task" className="flex flex-col">
            {CHOICES.map((choice) => {
              const selected = choice.value === visibility;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy || visibility === null}
                  onClick={() => void choose(choice.value)}
                  className="-mx-2 flex h-[55px] cursor-pointer items-center gap-[10px] rounded-[10px] px-2 text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]"
                >
                  <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--om-fill)] text-[var(--om-icon-1)]">
                    <choice.icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                    <span className="text-[14px] font-medium leading-5 text-[var(--om-text-1)]">{choice.label}</span>
                    <span className="truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">{choice.description}</span>
                  </span>
                  {selected ? (
                    <Check size={18} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[var(--om-icon-1)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {visibility === "public" && shareUrl ? (
            <input readOnly aria-label="Share link" value={link} onFocus={(e) => e.target.select()} className="mt-[8px] h-[32px] w-full rounded-[8px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] px-[10px] text-[13px] leading-[18px] text-[var(--om-text-2)] outline-none" />
          ) : null}
          <button
            type="button"
            disabled={busy || visibility === null}
            onClick={() => void copyLink()}
            className="mt-[8px] flex h-[32px] shrink-0 cursor-pointer items-center justify-center gap-[6px] rounded-[8px] bg-[var(--om-btn-primary)] text-[14px] font-medium leading-5 text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90"
          >
            <Link2 size={15} strokeWidth={2} aria-hidden="true" />
            {copied ? "Link copied" : "Copy link"}
          </button>
          <div role="status" className={cn("pt-[8px] text-[12px] leading-4", error ? "text-[var(--om-danger)]" : "text-[var(--om-text-3)]")}>
            {error ?? (visibility === null ? "Loading…" : visibility === "public" ? "The link is live: whoever has it can follow this task and its replay." : "Right now the link only works for you. Pick Anyone with the link to share it.")}
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}
