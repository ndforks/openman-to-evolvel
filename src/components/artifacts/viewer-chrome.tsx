"use client";

/** The frame around every artifact viewer: a header with the file name, size and download, plus loading and error states. */
import { useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { formatBytes, type ArtifactSource } from "./util";

export function ArtifactHeader({ source, title, actions, className }: { source?: ArtifactSource; title?: string; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-[44px] shrink-0 items-center gap-[8px] border-b border-[var(--om-border)] px-[12px]", className)}>
      <div className="flex min-w-0 flex-1 items-baseline gap-[8px]">
        <span className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title ?? source?.name}</span>
        {source?.size !== undefined ? <span className="shrink-0 text-[12px] text-[var(--om-text-3)]">{formatBytes(source.size)}</span> : null}
      </div>
      {actions}
      {source?.downloadUrl ? <DownloadButton href={source.downloadUrl} /> : null}
    </div>
  );
}

export function DownloadButton({ href, label = "Download" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      aria-label={label}
      title={label}
      className="flex h-[28px] shrink-0 items-center gap-[6px] rounded-[8px] px-[8px] text-[13px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)]"
    >
      <Download size={15} />
      <span className="max-sm:hidden">{label}</span>
    </a>
  );
}

export function ToolbarButton({ onClick, children, active, disabled, title }: { onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[28px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] px-[8px] text-[13px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)] disabled:cursor-default disabled:opacity-50",
        active && "bg-[var(--om-fill)] text-[var(--om-text-1)]",
      )}
    >
      {children}
    </button>
  );
}

export function ViewerMessage({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className={cn("flex min-h-[160px] flex-1 items-center justify-center p-[24px] text-center text-[13px] leading-[20px]", tone === "error" ? "text-[var(--om-danger)]" : "text-[var(--om-text-3)]")}>
      {children}
    </div>
  );
}

/** Fetches a text file. `null` while loading. */
export function useText(url: string | null, max = 600_000): { text: string | null; error: string | null; truncated: boolean } {
  const [state, setState] = useState<{ url: string; text: string | null; error: string | null; truncated: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load the file (${res.status}).`);
        const body = await res.text();
        if (!cancelled) setState({ url, text: body.slice(0, max), error: null, truncated: body.length > max });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ url, text: null, error: err instanceof Error ? err.message : "Could not load the file.", truncated: false });
      });
    return () => {
      cancelled = true;
    };
  }, [url, max]);
  if (!url || !state || state.url !== url) return { text: null, error: null, truncated: false };
  return state;
}
