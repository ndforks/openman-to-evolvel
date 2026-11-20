// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Settings → Connectors. Live data: apps signed in on the user's agent computer
 * (Orgo / Composio) plus custom MCP servers and APIs. A card opens the connector dialog (connect, reconnect, remove).
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useThemeClass } from "@/components/modals/theme";
import { ConnectorDialog, ConnectorLogo, CustomConnectorDialog, type CustomMode } from "@/components/pages/plugins/connector-ui";
import { Button, DIVIDER, Pane, SearchField, cn } from "@/components/settings/ui";
import type { ConnectorView } from "@/lib/connectors/catalog";
import { useConnectors } from "@/lib/connectors/client";

/** Kept for older imports; selections now live in the composer store and the server. */
export const CONNECTORS_ADDED_KEY = "connectors.added";
export const DEFAULT_ADDED: string[] = [];

const MENU_ITEM = "flex h-[32px] cursor-pointer select-none items-center rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]";

const CARD = cn("flex h-[76px] min-w-0 cursor-pointer items-center gap-[12px] rounded-[12px] border p-[12px] text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]", DIVIDER);

function Card({ connector, onOpen }: { connector: ConnectorView; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={connector.connected ? `Manage ${connector.name}` : `Connect ${connector.name}`} className={CARD}>
      <ConnectorLogo connector={connector} tile={40} mark={20} radius={8} />
      <span className="flex min-w-0 flex-1 flex-col items-start justify-center">
        <span className="w-full truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{connector.name}</span>
        <span className="line-clamp-2 w-full break-words text-[12px] leading-[16px] text-[var(--om-text-3)]">{connector.description}</span>
      </span>
      {connector.connected ? (
        <Check size={16} strokeWidth={2} aria-hidden="true" className="mx-[8px] shrink-0 text-[var(--om-icon-2)]" />
      ) : (
        <Plus size={16} strokeWidth={2} aria-hidden="true" className="mx-[8px] shrink-0 text-[var(--om-icon-2)]" />
      )}
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="pb-[8px] pt-[12px] text-[13px] leading-[19.5px] text-[var(--om-text-3)]">{children}</p>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="py-[10px] text-[13px] leading-[18px] text-[var(--om-text-4)]">{children}</div>;
}

export default function ConnectorsTab() {
  const themeClass = useThemeClass();
  const { data, error, loading } = useConnectors();
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [creating, setCreating] = useState<CustomMode | null>(null);
  const [selected, setSelected] = useState<ConnectorView | null>(null);

  const all = data?.connectors ?? [];
  const needle = query.trim().toLowerCase();
  const matches = (c: ConnectorView) => needle === "" || c.name.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle);
  const added = all.filter((c) => (c.connected || c.type !== "app") && matches(c));
  const available = all.filter((c) => !c.connected && c.type === "app" && matches(c));
  const showBrowse = browsing || needle !== "";

  return (
    <Pane title="Connectors">
      <div className="flex w-full items-center justify-between gap-[12px] pt-[24px]">
        <SearchField value={query} onChange={setQuery} placeholder="Search connectors" />
        <div className="flex shrink-0 items-center gap-[8px]">
          <Button aria-pressed={browsing} className={cn(browsing && "bg-[var(--om-fill)]")} onClick={() => setBrowsing((v) => !v)}>
            Browse Connectors
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="inline-flex h-[32px] min-w-[64px] shrink-0 cursor-pointer items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] px-[8px] text-[14px] font-medium leading-[18px] text-[var(--om-text-1)] outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] transition-colors hover:bg-[var(--om-fill-subtle)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)] data-[state=open]:bg-[var(--om-fill-subtle)]">
              Create
              <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className={cn(themeClass, "z-[120] min-w-[180px] rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] font-sans text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]")}
              >
                <DropdownMenu.Item className={MENU_ITEM} onSelect={() => setCreating("api")}>
                  Custom API
                </DropdownMenu.Item>
                <DropdownMenu.Item className={MENU_ITEM} onSelect={() => setCreating("mcp")}>
                  Custom MCP server
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {error && !data ? <Empty>{error}</Empty> : null}

      <GroupLabel>Added</GroupLabel>
      {!data && loading ? (
        <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className={cn("h-[76px] animate-pulse rounded-[12px] border bg-[var(--om-fill-subtle)]", DIVIDER)} />
          ))}
        </div>
      ) : added.length > 0 ? (
        <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2">
          {added.map((c) => (
            <Card key={c.slug} connector={c} onOpen={() => setSelected(c)} />
          ))}
        </div>
      ) : (
        <Empty>{needle === "" ? "Nothing connected yet. Browse the catalog to link an app." : "No added connectors match your search."}</Empty>
      )}

      {showBrowse ? (
        <>
          <GroupLabel>Browse</GroupLabel>
          {available.length > 0 ? (
            <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2">
              {available.map((c) => (
                <Card key={c.slug} connector={c} onOpen={() => setSelected(c)} />
              ))}
            </div>
          ) : (
            <Empty>{needle === "" ? "You have added every connector in the catalog." : "No connectors match your search."}</Empty>
          )}
        </>
      ) : null}

      {selected ? <ConnectorDialog connector={selected} onClose={() => setSelected(null)} /> : null}
      {creating ? <CustomConnectorDialog mode={creating} onClose={() => setCreating(null)} /> : null}
    </Pane>
  );
}
