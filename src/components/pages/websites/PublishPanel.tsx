"use client";

/** The Publish popover body and the versions list, shared by the task preview and the site dashboard. */
import { Check, ChevronDown, Copy, ExternalLink, Globe, History, Lock, Mail, RotateCcw, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { brand } from "@/config/brand";
import { listCheckpoints, publishWebsite, rollbackTo, screenshotUrl, setVisibility, timeAgo, unpublishWebsite, updateWebsite } from "@/lib/websites/client";
import { VISIBILITY_LABELS, type SiteCheckpoint, type SiteVisibility, type Website } from "@/lib/websites/types";

const VIS_ICON: Record<SiteVisibility, ReactNode> = {
  public: <Globe size={16} strokeWidth={1.8} aria-hidden />,
  invite: <Users size={16} strokeWidth={1.8} aria-hidden />,
  private: <Lock size={16} strokeWidth={1.8} aria-hidden />,
};

export const VIS_TEXT: Record<SiteVisibility, string> = { public: "Anyone with the link", invite: "Only people invited", private: "Only my workspace" };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function StatusDot({ site }: { site: Website }) {
  const published = site.status === "published";
  const label = site.status === "publishing" ? "Publishing" : published ? "Published" : "Not published";
  return (
    <span className="flex items-center gap-[6px] text-[13px] leading-[18px] text-[var(--om-text-2)]">
      <span className={cn("size-[6px] rounded-full", published ? "bg-[#3FBF5F]" : site.status === "publishing" ? "bg-[#f5a524]" : "bg-[var(--om-icon-3)]")} />
      {label}
    </span>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex h-[36px] items-center gap-[6px] rounded-[10px] border border-[var(--om-border)] bg-[var(--om-fill)] pl-[10px] pr-[4px]">
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--om-text-1)]" title={value}>
        {value.replace(/^https?:\/\//, "")}
      </span>
      <button
        type="button"
        aria-label="Copy link"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="flex size-[28px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]"
      >
        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      </button>
      <a href={value} target="_blank" rel="noopener noreferrer" aria-label="Open published site" className="flex size-[28px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
        <ExternalLink size={15} aria-hidden />
      </a>
    </div>
  );
}

export function VisibilitySelect({ site, onChange, disabled }: { site: Website; onChange: (site: Website) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const pick = async (v: SiteVisibility) => {
    if (v === site.visibility) return;
    setBusy(true);
    try {
      onChange((await setVisibility(site.id, v)).site);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled || busy}>
        <button
          type="button"
          className="flex h-[40px] w-full items-center gap-[8px] rounded-[10px] bg-[var(--om-fill)] px-[12px] text-left text-[14px] text-[var(--om-text-1)] outline-none hover:bg-[var(--om-fill-strong)] disabled:opacity-60"
        >
          <span className="text-[var(--om-icon-2)]">{VIS_ICON[site.visibility]}</span>
          <span className="flex-1 truncate">{busy ? "Saving…" : VIS_TEXT[site.visibility]}</span>
          <ChevronDown size={16} className="text-[var(--om-icon-3)]" aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[280px]">
        {(Object.keys(VISIBILITY_LABELS) as SiteVisibility[]).map((v) => (
          <MenuItem key={v} onSelect={() => void pick(v)} className="items-start">
            <span className="mt-[2px] text-[var(--om-icon-2)]">{VIS_ICON[v]}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{VIS_TEXT[v]}</span>
              <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">{VISIBILITY_LABELS[v].hint}</span>
            </span>
            {v === site.visibility ? <Check size={16} className="mt-[2px] text-[var(--om-icon-1)]" aria-hidden /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function InviteField({ site, onChange }: { site: Website; onChange: (site: Website) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const emails = value.split(/[\s,;]+/).filter((e) => /.+@.+\..+/.test(e));
    if (!emails.length) return;
    setBusy(true);
    try {
      onChange((await setVisibility(site.id, "invite", emails)).site);
      setValue("");
      toast(`Invited ${emails.length === 1 ? emails[0] : `${emails.length} people`}.`, "success");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-[6px]">
      <div className="flex h-[36px] flex-1 items-center gap-[6px] rounded-[10px] border border-[var(--om-border)] px-[10px]">
        <Mail size={14} className="text-[var(--om-icon-3)]" aria-hidden />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Invite by email"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]"
        />
      </div>
      <button type="button" disabled={busy || !value.trim()} onClick={() => void send()} className="h-[36px] rounded-[10px] border border-[var(--om-border)] px-[12px] text-[13px] font-medium text-[var(--om-text-1)] hover:bg-[var(--om-fill)] disabled:opacity-50">
        Invite
      </button>
    </div>
  );
}

/** Body of the Publish popover (400 px wide, "Publish" + status, General access, Auto-publish, Publish now). */
export function PublishPanel({ site, onChange, canPublish = true }: { site: Website; onChange: (site: Website) => void; canPublish?: boolean }) {
  const [busy, setBusy] = useState<"publish" | "unpublish" | null>(null);
  const published = site.status === "published" && !!site.publishedUrl;

  const run = async (kind: "publish" | "unpublish") => {
    setBusy(kind);
    try {
      const { site: next } = kind === "publish" ? await publishWebsite(site.id) : await unpublishWebsite(site.id);
      onChange(next);
      toast(kind === "publish" ? "Your website is live." : "Your website is no longer published.", "success");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (patch: { autoPublish?: boolean; showBadge?: boolean }) => {
    try {
      onChange((await updateWebsite(site.id, patch)).site);
    } catch (err) {
      toast(errorText(err), "error");
    }
  };

  return (
    <div className="flex flex-col gap-[12px] p-[16px]">
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-semibold leading-[22px] text-[var(--om-text-1)]">Publish</span>
        <StatusDot site={busy === "publish" ? { ...site, status: "publishing" } : site} />
      </div>
      {published ? <CopyField value={site.publishedUrl!} /> : null}
      <div className="flex flex-col gap-[6px]">
        <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">General access</span>
        <VisibilitySelect site={site} onChange={onChange} />
        {site.visibility === "invite" ? <InviteField site={site} onChange={onChange} /> : null}
      </div>
      <label className="flex items-center justify-between gap-[12px] py-[2px] text-[14px] text-[var(--om-text-1)]">
        Auto-publish when it is ready
        <Switch checked={site.autoPublish} onCheckedChange={(v) => void toggle({ autoPublish: v })} />
      </label>
      <label className="flex items-center justify-between gap-[12px] py-[2px] text-[14px] text-[var(--om-text-1)]">
        Show “Made with {brand.name}” badge
        <Switch checked={site.showBadge} onCheckedChange={(v) => void toggle({ showBadge: v })} />
      </label>
      {site.error && site.status !== "published" ? <p className="text-[12px] leading-[16px] text-[var(--om-danger)]">{site.error}</p> : null}
      <button
        type="button"
        disabled={!canPublish || busy !== null}
        onClick={() => void run("publish")}
        className="flex h-[40px] items-center justify-center rounded-[10px] bg-[var(--om-btn-primary)] text-[14px] font-medium text-[var(--om-text-inverse)] hover:opacity-90 disabled:opacity-50"
      >
        {busy === "publish" ? "Publishing…" : published ? "Update" : "Publish now"}
      </button>
      {published ? (
        <button type="button" disabled={busy !== null} onClick={() => void run("unpublish")} className="h-[32px] text-[13px] text-[var(--om-text-3)] hover:text-[var(--om-text-1)] disabled:opacity-50">
          {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
        </button>
      ) : null}
    </div>
  );
}

/** Versions (git checkpoints) with screenshots and rollback. */
export function VersionsList({ site, onRolledBack, compact = false }: { site: Website; onRolledBack?: () => void; compact?: boolean }) {
  const [items, setItems] = useState<SiteCheckpoint[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listCheckpoints(site.id)
      .then(({ checkpoints }) => alive && setItems(checkpoints))
      .catch((err) => alive && setError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [site.id, site.updatedAt]);

  const restore = async (sha: string) => {
    setBusy(sha);
    try {
      setItems((await rollbackTo(site.id, sha)).checkpoints);
      toast(`Restored version ${sha.slice(0, 7)}.`, "success");
      onRolledBack?.();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="p-[16px] text-[13px] text-[var(--om-text-3)]">{error}</p>;
  if (!items) return <p className="p-[16px] text-[13px] text-[var(--om-text-3)]">Loading versions…</p>;
  if (!items.length) return <p className="p-[16px] text-[13px] text-[var(--om-text-3)]">No versions yet.</p>;
  return (
    <ul className={cn("flex flex-col", compact ? "max-h-[420px] overflow-y-auto p-[4px]" : "gap-[8px]")}>
      {items.map((c, i) => (
        <li key={c.sha} className={cn("flex items-center gap-[12px] rounded-[10px] p-[8px]", compact ? "hover:bg-[var(--om-fill)]" : "border border-[var(--om-border)]")}>
          <div className={cn("shrink-0 overflow-hidden rounded-[6px] border border-[var(--om-border)] bg-[var(--om-fill)]", compact ? "h-[40px] w-[64px]" : "h-[60px] w-[96px]")}>
            {c.screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={screenshotUrl(site.id, c.sha)} alt="" className="size-full object-cover object-top" loading="lazy" />
            ) : (
              <div className="flex size-full items-center justify-center text-[var(--om-icon-3)]">
                <History size={14} aria-hidden />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] leading-[20px] text-[var(--om-text-1)]">{c.message}</span>
            <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">
              {c.sha.slice(0, 7)} · {timeAgo(c.at)}
              {i === 0 ? " · Current" : ""}
              {c.published ? " · Published" : ""}
            </span>
          </div>
          {i > 0 ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void restore(c.sha)}
              className="flex h-[30px] shrink-0 items-center gap-[4px] rounded-[8px] border border-[var(--om-border)] px-[8px] text-[12px] font-medium text-[var(--om-text-1)] hover:bg-[var(--om-fill)] disabled:opacity-50"
            >
              <RotateCcw size={12} aria-hidden />
              {busy === c.sha ? "Restoring…" : "Restore"}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
