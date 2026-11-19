"use client";

import { Check, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useUI } from "@/lib/ui-store";
import { useConnectors } from "@/lib/connectors/client";
import type { ConnectorView } from "@/lib/connectors/catalog";
import { cx } from "../cx";
import { CreateMenu, OutlineButton, PageShell, PillTabs, PluginsSkillsTitle, SearchField, type MenuOption, type PillTab } from "../ui";
import { ConnectorDialog, ConnectorLogo, CustomConnectorDialog, type CustomMode } from "./connector-ui";

const CREATE_OPTIONS: MenuOption[] = [
  { id: "mcp", label: "Custom MCP", description: "Point the agent at an MCP server you run" },
  { id: "api", label: "Custom API", description: "Give the agent a REST API and its key" },
];

const FEATURED_TEXT: Record<string, string> = {
  gmail: "Let tasks read, sort and draft your mail.",
  slack: "Get the gist of busy channels, or post for you.",
  notion: "Search and update the pages your team keeps.",
  github: "Triage issues and summarise pull requests.",
  googlecalendar: "Book, move and check meetings.",
  googledrive: "Open and organise the files in your Drive.",
};

function PluginRow({ connector, onOpen }: { connector: ConnectorView; onOpen: (c: ConnectorView) => void }) {
  return (
    <li className="flex h-[76px] min-w-0 items-center gap-[12px] rounded-[12px] border border-[var(--om-border)] p-[12px] transition-colors hover:bg-[var(--om-fill-subtle)]">
      <button type="button" onClick={() => onOpen(connector)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-[12px] text-left outline-none">
        <ConnectorLogo connector={connector} tile={40} mark={20} radius={8} />
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center">
          <div className="w-full truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{connector.name}</div>
          <div className="line-clamp-2 w-full break-words text-[12px] leading-[16px] text-[var(--om-text-3)]">{connector.description}</div>
        </div>
      </button>
      {connector.connected ? (
        <button
          type="button"
          onClick={() => onOpen(connector)}
          aria-label={`${connector.name} is connected. Manage`}
          title="Connected"
          className="flex size-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]"
        >
          <Check size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(connector)}
          aria-label={`Connect ${connector.name}`}
          title="Connect"
          className="flex size-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--om-border)] text-[var(--om-icon-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]"
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
        </button>
      )}
    </li>
  );
}

function SkeletonRows() {
  return (
    <ul className="grid grid-cols-1 gap-[12px] md:grid-cols-2" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="h-[76px] animate-pulse rounded-[12px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)]" />
      ))}
    </ul>
  );
}

export function PluginsPage() {
  const open = useUI((s) => s.open);
  const { data, error, loading } = useConnectors();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const [selected, setSelected] = useState<ConnectorView | null>(null);
  const [creating, setCreating] = useState<CustomMode | null>(null);
  const [stripEnd, setStripEnd] = useState(false);
  const strip = useRef<HTMLDivElement>(null);

  const all = useMemo(() => data?.connectors ?? [], [data]);
  const featured = all.filter((c) => c.featured);
  const tabs = useMemo<PillTab<string>[]>(() => {
    const cats = [...new Set(all.map((c) => c.category))];
    const custom = all.some((c) => c.type !== "app");
    return [{ id: "All", label: "All" }, { id: "Connected", label: "Connected" }, ...cats.filter((c) => c !== "Other").map((c) => ({ id: c, label: c })), ...(custom ? [{ id: "Custom", label: "Custom" }] : [])];
  }, [all]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((c) => {
      if (filter === "Connected" && !c.connected) return false;
      if (filter === "Custom" && c.type === "app") return false;
      if (filter !== "All" && filter !== "Connected" && filter !== "Custom" && c.category !== filter) return false;
      if (!needle) return true;
      return c.name.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle) || c.slug.includes(needle);
    });
  }, [all, query, filter]);

  const onStripScroll = () => {
    const el = strip.current;
    if (el) setStripEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  };

  return (
    <PageShell
      title={<PluginsSkillsTitle active="plugins" />}
      actions={
        <>
          <OutlineButton onClick={() => open("settings", { tab: "connectors" })}>Manage Connectors</OutlineButton>
          <CreateMenu primary label="New" ariaLabel="Create" options={CREATE_OPTIONS} onSelect={(id) => setCreating(id === "api" ? "api" : "mcp")} />
        </>
      }
    >
      <div className="flex w-full flex-col pb-[28px] pt-[28px]">
        {featured.length > 0 ? (
          <div
            ref={strip}
            onScroll={onStripScroll}
            style={stripEnd ? undefined : { maskImage: "linear-gradient(to right, #000 calc(100% - 100px), transparent)", WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 100px), transparent)" }}
            className="flex w-full shrink-0 items-stretch gap-[16px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {featured.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setSelected(c)}
                className="flex w-[280px] shrink-0 cursor-pointer flex-col items-start justify-start gap-[8px] overflow-hidden rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)] p-[12px] text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]"
              >
                <ConnectorLogo connector={c} tile={40} mark={20} radius={8} />
                <span className="line-clamp-2 h-[40px] w-full break-words text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{FEATURED_TEXT[c.slug] ?? c.description}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex w-full min-w-0 flex-col gap-[16px] pb-[16px] pt-[24px]">
          <SearchField value={query} onChange={setQuery} placeholder="Search" ariaLabel="Search plugins" className="w-full" />
          <PillTabs tabs={tabs} value={filter} onChange={setFilter} label="Plugin categories" className="min-h-[32px] flex-wrap" />
        </div>

        {error && !data ? (
          <p className="pt-[48px] text-center text-[13px] text-[var(--om-text-2)]">{error}</p>
        ) : !data && loading ? (
          <SkeletonRows />
        ) : visible.length > 0 ? (
          <ul className="grid grid-cols-1 content-start gap-[12px] md:grid-cols-2">
            {visible.map((c) => (
              <PluginRow key={c.slug} connector={c} onOpen={setSelected} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-[2px] pt-[72px] text-center">
            <div className="text-[14px] font-semibold leading-[20px] text-[var(--om-text-1)]">Nothing matches</div>
            <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">Change the search words or pick another category.</div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("All");
              }}
              className={cx("mt-[12px] cursor-pointer text-[13px] leading-[18px] text-[var(--om-text-accent)] outline-none hover:underline focus-visible:underline")}
            >
              Clear filters
            </button>
          </div>
        )}
        {data && !data.configured ? <p className="pt-[16px] text-center text-[13px] text-[var(--om-text-3)]">Your agent&apos;s computer isn&apos;t set up yet. Start a task once, then connect apps here.</p> : null}
      </div>
      {selected ? <ConnectorDialog connector={selected} onClose={() => setSelected(null)} /> : null}
      {creating ? <CustomConnectorDialog mode={creating} onClose={() => setCreating(null)} /> : null}
    </PageShell>
  );
}
