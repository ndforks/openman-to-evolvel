// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** The user's sites on the Websites page: the "My websites" strip and the full list with status and actions. */
import { Copy, ExternalLink, Globe, LayoutDashboard, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { copyWebsite, deleteWebsite, screenshotUrl, timeAgo } from "@/lib/websites/client";
import type { Website } from "@/lib/websites/types";

export function siteStatusLabel(site: Website): { label: string; tone: string } {
  switch (site.status) {
    case "published":
      return { label: "Live", tone: "bg-[#3FBF5F]" };
    case "publishing":
      return { label: "Publishing", tone: "bg-[#f5a524]" };
    case "building":
      return { label: "Building", tone: "bg-[var(--om-icon-accent)]" };
    case "failed":
      return { label: "Publish failed", tone: "bg-[var(--om-danger)]" };
    default:
      return { label: "Not published", tone: "bg-[var(--om-icon-3)]" };
  }
}

export function SiteThumb({ site, className }: { site: Website; className?: string }) {
  // A screenshot that can't be read (the server answers 204) falls back to the globe.
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span className={cn("flex w-full shrink-0 overflow-hidden bg-[var(--om-card)]", className)}>
      {site.thumbSha && broken !== site.thumbSha ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="size-full max-h-full max-w-full object-cover object-top" alt="" src={screenshotUrl(site.id, site.thumbSha)} loading="lazy" onError={() => setBroken(site.thumbSha)} />
      ) : (
        <span className="flex size-full items-center justify-center text-[var(--om-icon-3)]">
          <Globe size={18} strokeWidth={1.6} aria-hidden />
        </span>
      )}
    </span>
  );
}

/** Recent strip: three 104 px cards, 62 px thumbnail, 12/16 name, 11/14 date. */
export function RecentSites({ sites, onViewAll }: { sites: Website[]; onViewAll: () => void }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex h-[28px] items-center justify-between gap-[8px]">
        <h2 className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">My websites</h2>
        {sites.length > 3 ? (
          <button type="button" onClick={onViewAll} className="flex h-[28px] shrink-0 items-center gap-[4px] rounded-[6px] px-[6px] text-[13px] leading-[18px] text-[var(--om-text-2)] transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)]">
            View all
          </button>
        ) : null}
      </div>
      <div className="grid h-[104px] max-w-[340px] grid-cols-3 gap-[8px]">
        {sites.slice(0, 3).map((site) => (
          <button
            key={site.id}
            type="button"
            title={site.name}
            onClick={() => router.push(`/app/website/${site.id}`)}
            className="group flex w-full min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--om-border)] bg-[var(--om-surface)] text-start transition-colors duration-150 hover:border-[var(--om-border-strong)]"
          >
            <SiteThumb site={site} className="h-[62px] border-b border-[var(--om-border-subtle)]" />
            <span className="flex w-full min-w-0 flex-col px-[8px] pb-[6px] pt-[6px]">
              <span className="truncate text-[12px] leading-[16px] text-[var(--om-text-1)]">{site.name}</span>
              <span className="h-[14px] truncate text-[11px] leading-[14px] text-[var(--om-text-3)]">{timeAgo(site.updatedAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SiteActions({ site, onChanged, onDeleted }: { site: Website; onChanged?: () => void; onDeleted?: () => void }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${site.name}`} className="flex size-[28px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none hover:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]">
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-[210px]">
        <MenuItem onSelect={() => router.push(`/app/website/${site.id}`)}>
          <LayoutDashboard size={16} aria-hidden /> Dashboard
        </MenuItem>
        {site.taskId ? (
          <MenuItem onSelect={() => router.push(`/app/task/${site.taskId}`)}>
            <MessageSquare size={16} aria-hidden /> Open task
          </MenuItem>
        ) : null}
        {site.publishedUrl ? (
          <MenuItem onSelect={() => window.open(site.publishedUrl!, "_blank", "noopener")}>
            <ExternalLink size={16} aria-hidden /> Visit site
          </MenuItem>
        ) : null}
        <MenuItem
          onSelect={() =>
            void copyWebsite(site.id)
              .then(() => {
                toast("Copy made.", "success");
                onChanged?.();
              })
              .catch((e: Error) => toast(e.message, "error"))
          }
        >
          <Copy size={16} aria-hidden /> Make a copy
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          className="text-[var(--om-danger)]"
          onSelect={() => {
            if (!window.confirm(`Delete "${site.name}"? Its files, preview and published site are removed.`)) return;
            void deleteWebsite(site.id)
              .then(() => {
                toast("Website deleted.", "success");
                onDeleted?.();
              })
              .catch((e: Error) => toast(e.message, "error"));
          }}
        >
          <Trash2 size={16} aria-hidden /> Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Every site, one row each: thumbnail, name, status, URL, actions. */
export function SitesList({ sites, onChanged }: { sites: Website[]; onChanged: () => void }) {
  const router = useRouter();
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-[var(--om-border)] bg-[var(--om-surface)]">
      <div className="flex h-[44px] shrink-0 items-center justify-between gap-[8px] pe-[8px] ps-[16px]">
        <h2 className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">All websites</h2>
        <span className="text-[12px] text-[var(--om-text-3)]">{sites.length}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-[8px] pb-[8px] [scrollbar-width:thin]">
        {sites.map((site) => {
          const status = siteStatusLabel(site);
          return (
            <li key={site.id} className="group flex h-[52px] items-center gap-[10px] rounded-[10px] px-[8px] hover:bg-[var(--om-fill)]">
              <button type="button" onClick={() => router.push(`/app/website/${site.id}`)} className="flex min-w-0 flex-1 items-center gap-[10px] text-start outline-none">
                <SiteThumb site={site} className="h-[34px] w-[54px] rounded-[6px] border border-[var(--om-border-subtle)]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">{site.name}</span>
                  <span className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">{site.publishedUrl ? site.publishedUrl.replace(/^https?:\/\//, "") : timeAgo(site.updatedAt)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-[6px] text-[12px] text-[var(--om-text-2)]">
                  <span className={cn("size-[6px] rounded-full", status.tone)} />
                  {status.label}
                </span>
              </button>
              <SiteActions site={site} onChanged={onChanged} onDeleted={onChanged} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
