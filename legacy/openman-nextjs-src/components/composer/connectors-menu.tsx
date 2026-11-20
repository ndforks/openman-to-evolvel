// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The connectors button in the input toolbar. Connected connectors (Orgo app sign-ins and custom MCP / API) switch on
 * and off for the next task; with a project picked, the selection is also saved as that project's default
 * (`/api/connectors/projects/{id}`). Apps not yet connected offer "Connect", which opens the connector dialog.
 */
import { useEffect, useState, type ReactNode } from "react";
import { BrandIcon } from "@/components/ui/brand-icon";
import { ChevronRightIcon, ConnectorsIcon, MailIcon, PhoneIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { ConnectorDialog, ConnectorLogo } from "@/components/pages/plugins/connector-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { ConnectorView } from "@/lib/connectors/catalog";
import { useConnectors } from "@/lib/connectors/client";
import { useUI } from "@/lib/ui-store";
import { useComposerStore } from "./store";

/** Row: 36 px tall, 8 px radius, a 28 px logo box, 14 px label. */
const ROW = "flex h-[36px] w-full shrink-0 select-none items-center justify-between gap-[8px] rounded-[8px] pe-[8px] ps-[4px] text-left text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none";
const ROW_BUTTON = `${ROW} cursor-pointer hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]`;
const HAIRLINE = "h-px shrink-0 bg-[var(--om-border)]";

/** Round 24 px chip holding a 14 px logo, overlapped in the "Add connectors" row. */
function MiniLogo({ children }: { children: ReactNode }) {
  return <span className="flex size-[24px] shrink-0 items-center justify-center rounded-full border border-[var(--om-border)] bg-[var(--om-surface)]">{children}</span>;
}

function Name({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-[4px] overflow-hidden">
      <span className="flex size-[28px] shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

const BUILT_IN = [
  { id: "phone", label: "Phone", icon: <PhoneIcon size={16} strokeWidth={2} className="text-[var(--om-icon-1)]" />, tab: "phone" },
  { id: "email", label: "Email", icon: <MailIcon size={16} strokeWidth={2} className="text-[var(--om-icon-1)]" />, tab: "email" },
];

/** Loads a project's saved connectors into the composer when the project changes. */
function useProjectSelection(projectId: string | null) {
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    fetch(`/api/connectors/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { connectors?: string[] } | null) => {
        if (!alive || !body?.connectors?.length) return;
        const store = useComposerStore.getState();
        for (const id of store.connectors) if (!body.connectors.includes(id)) store.toggleConnector(id, false);
        for (const id of body.connectors) store.toggleConnector(id, true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId]);
}

export function ConnectorsMenu() {
  const openModal = useUI((s) => s.open);
  const enabled = useComposerStore((s) => s.connectors);
  const toggleConnector = useComposerStore((s) => s.toggleConnector);
  const projectId = useComposerStore((s) => s.projectId);
  const { data } = useConnectors();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<ConnectorView | null>(null);
  useProjectSelection(projectId);

  const all = data?.connectors ?? [];
  const needle = query.trim().toLowerCase();
  const match = (label: string) => !needle || label.toLowerCase().includes(needle);
  const connected = all.filter((c) => c.connected && match(c.name));
  // Not-yet-connected apps: the featured ones by default, everything when searching.
  const offer = all.filter((c) => !c.connected && c.type === "app" && (needle ? match(c.name) : c.featured)).slice(0, needle ? 30 : 8);
  const builtIn = BUILT_IN.filter((b) => match(b.label));
  const logos = all.filter((c) => c.connected && c.logo).slice(0, 2);

  const openSettings = (tab: string) => {
    setIsOpen(false);
    openModal("settings", { tab });
  };

  const toggle = (id: string, on: boolean) => {
    toggleConnector(id, on);
    if (projectId) {
      const next = useComposerStore.getState().connectors;
      void fetch(`/api/connectors/projects/${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectors: next }) }).catch(() => undefined);
    }
  };

  return (
    <>
      <Popover
        open={isOpen}
        onOpenChange={(next) => {
          setIsOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          {/* A 32 px round button drawn with a 1 px inset outline, holding a 16 px cable. */}
          <button
            type="button"
            aria-label={enabled.length ? `Connectors (${enabled.length} on)` : "Connectors"}
            className="relative flex h-[32px] min-w-0 shrink-0 cursor-pointer select-none items-center gap-[4px] rounded-[100px] p-[8px] text-[var(--om-icon-2)] outline outline-1 -outline-offset-1 outline-[var(--om-border)] transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)] data-[state=open]:bg-[var(--om-fill-subtle)]"
          >
            <ConnectorsIcon size={16} />
            {enabled.length > 0 ? <span className="absolute right-[3px] top-[3px] size-[6px] rounded-full bg-[var(--om-btn-accent)]" aria-hidden /> : null}
          </button>
        </PopoverTrigger>
        {/* Opening upward: "Add connectors" on top, the list in the middle and the search field at the bottom, nearest the input. */}
        <PopoverContent side="top" align="start" sideOffset={4} aria-label="Connectors" className="flex h-[min(400px,calc(var(--radix-popover-content-available-height)-8px))] w-[320px] flex-col p-0">
          <div className="shrink-0 p-[4px]">
            <button type="button" onClick={() => openSettings("connectors")} className="flex h-[36px] w-full cursor-pointer select-none items-center justify-between rounded-[8px] px-[8px] outline-none hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]">
              <span className="flex items-center gap-[8px]">
                <span className="flex size-[20px] items-center justify-center">
                  <PlusIcon size={16} className="text-[var(--om-icon-1)]" />
                </span>
                <span className="text-[14px] leading-[20px] text-[var(--om-text-1)]">Add connectors</span>
              </span>
              <span className="flex items-center -space-x-[4px]">
                {logos.length > 0 ? (
                  logos.map((c) => (
                    <MiniLogo key={c.slug}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.logo} alt="" width={14} height={14} className="size-[14px] object-contain" />
                    </MiniLogo>
                  ))
                ) : (
                  <>
                    <MiniLogo>
                      <BrandIcon src="/brands/gmail-color.svg" size={14} />
                    </MiniLogo>
                    <MiniLogo>
                      <BrandIcon src="/brands/notion.svg" size={14} />
                    </MiniLogo>
                  </>
                )}
                <MiniLogo>
                  <span className="text-[10px] leading-[16px] text-[var(--om-text-3)]">+{Math.max(0, all.length - 2) > 99 ? 99 : Math.max(0, all.length - 2)}</span>
                </MiniLogo>
              </span>
            </button>
          </div>
          <div className={HAIRLINE} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-[4px] [scrollbar-width:none]">
            {builtIn.map((b) => (
              <button key={b.id} type="button" onClick={() => openSettings(b.tab)} className={ROW_BUTTON}>
                <Name icon={b.icon} label={b.label} />
                <ChevronRightIcon size={16} className="shrink-0 text-[var(--om-icon-3)]" />
              </button>
            ))}
            {connected.map((c) => (
              <label key={c.slug} className={`${ROW} cursor-pointer hover:bg-[var(--om-fill)]`}>
                <Name icon={<ConnectorLogo connector={c} tile={20} mark={16} radius={5} className="border-0 bg-transparent" />} label={c.name} />
                <Switch checked={enabled.includes(c.slug)} onCheckedChange={(on) => toggle(c.slug, on)} aria-label={c.name} />
              </label>
            ))}
            {offer.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setDialog(c);
                }}
                className={ROW_BUTTON}
              >
                <Name icon={<ConnectorLogo connector={c} tile={20} mark={16} radius={5} className="border-0 bg-transparent" />} label={c.name} />
                <span className="shrink-0 text-[var(--om-text-2)]">Connect</span>
              </button>
            ))}
            {builtIn.length + connected.length + offer.length === 0 ? <p className="px-[8px] py-[8px] text-[14px] leading-[20px] text-[var(--om-text-3)]">Nothing matches that search</p> : null}
          </div>
          <div className={HAIRLINE} />
          <div className="shrink-0 p-[4px]">
            <label className="flex items-center gap-[8px] p-[8px]">
              <SearchIcon size={16} className="text-[var(--om-icon-3)]" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search connectors"
                aria-label="Search connectors"
                className="min-w-0 flex-1 bg-transparent text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-3)]"
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>
      {dialog ? <ConnectorDialog connector={dialog} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
