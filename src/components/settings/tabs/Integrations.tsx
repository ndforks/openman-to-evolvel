"use client";

/**
 * Settings → Integrations.
 * Top: the chat apps the agent works in (Slack and Telegram, through Hermes' own gateway on the user's computer),
 * as two cards with live status. Below: custom MCP servers and custom APIs installed into the agent (Hermes' own
 * MCP config).
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ChannelDialog, ChannelLogo, StatusPill } from "@/components/modals/UseAnywhereChannels";
import { brand } from "@/config/brand";
import { useChannels } from "@/lib/channels/client";
import type { ChannelId } from "@/lib/channels/types";
import { ConnectorDialog, ConnectorLogo, CustomConnectorDialog, type CustomMode } from "@/components/pages/plugins/connector-ui";
import { Button, DIVIDER, cn } from "@/components/settings/ui";
import type { ConnectorView } from "@/lib/connectors/catalog";
import { useConnectors } from "@/lib/connectors/client";

function Header() {
  return (
    <div className={cn("flex flex-col gap-[4px] border-b pb-[16px] pt-[34px]", DIVIDER)}>
      <h2 className="text-[24px] font-medium leading-[30px] text-[var(--om-text-1)]">Integrations</h2>
      <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Reach the agent from chat apps and plug in your own tools</p>
    </div>
  );
}

const CHANNEL_CARDS: { id: ChannelId; title: string; body: string }[] = [
  { id: "slack", title: `Slack`, body: `Mention @${brand.name} in a channel or DM to hand it work` },
  { id: "telegram", title: `Telegram`, body: `Pair a private bot with a QR code, then text it jobs, voice memos and files` },
];

function ChannelCards({ onOpen }: { onOpen: (id: ChannelId) => void }) {
  const { data } = useChannels();
  return (
    <div className="grid gap-[12px] pt-[24px] sm:grid-cols-1 md:grid-cols-2">
      {CHANNEL_CARDS.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c.id)}
          className="flex min-h-[88px] cursor-pointer items-center gap-[16px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)] p-[16px] text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]"
        >
          <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-[var(--om-border)] bg-[var(--om-surface)]">
            <ChannelLogo channel={c.id} size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{c.title}</span>
            <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{c.body}</span>
            {data?.configured ? <span className="mt-[4px]"><StatusPill health={data[c.id]} /></span> : null}
          </span>
          <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-[var(--om-icon-3)]" aria-hidden />
        </button>
      ))}
    </div>
  );
}

function Section({ title, subtitle, items, onAdd, addLabel, onOpen, loading }: { title: string; subtitle: string; items: ConnectorView[]; onAdd: () => void; addLabel: string; onOpen: (c: ConnectorView) => void; loading: boolean }) {
  return (
    <section className="flex flex-col pt-[24px]">
      <div className="flex items-center justify-between gap-[16px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{subtitle}</div>
        </div>
        <Button onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
      <div className="mt-[12px] flex flex-col gap-[8px]">
        {loading && items.length === 0 ? <div className={cn("h-[64px] animate-pulse rounded-[12px] border bg-[var(--om-fill-subtle)]", DIVIDER)} /> : null}
        {items.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => onOpen(c)}
            className={cn("flex h-[64px] min-w-0 cursor-pointer items-center gap-[12px] rounded-[12px] border bg-[var(--om-card)] px-[12px] text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]", DIVIDER)}
          >
            <ConnectorLogo connector={c} tile={40} mark={20} radius={8} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{c.name}</span>
              <span className="truncate font-mono text-[12px] leading-[16px] text-[var(--om-text-3)]">{c.detail}</span>
            </span>
            <span className="flex shrink-0 items-center gap-[6px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
              <span className={cn("size-[6px] rounded-full", c.status === "ready" ? "bg-[var(--om-success)]" : c.status === "error" ? "bg-[var(--om-danger)]" : "bg-[var(--om-icon-disabled)]")} />
              {c.status === "ready" ? (c.type === "mcp" ? `${c.tools?.length ?? 0} tools` : "Ready") : c.status === "error" ? "Failed" : "Installing"}
            </span>
          </button>
        ))}
        {!loading && items.length === 0 ? <div className="py-[6px] text-[13px] leading-[18px] text-[var(--om-text-4)]">None yet.</div> : null}
      </div>
    </section>
  );
}

export default function IntegrationsTab() {
  const { data, loading } = useConnectors();
  const [creating, setCreating] = useState<CustomMode | null>(null);
  const [selected, setSelected] = useState<ConnectorView | null>(null);
  const [channel, setChannel] = useState<ChannelId | null>(null);
  const all = data?.connectors ?? [];
  const mcp = all.filter((c) => c.type === "mcp");
  const apis = all.filter((c) => c.type === "api");

  return (
    <div className="flex flex-col">
      <Header />
      <ChannelCards onOpen={setChannel} />
      <Section
        title="Custom MCP servers"
        subtitle={`${mcp.filter((c) => c.status === "ready").length} server${mcp.length === 1 ? "" : "s"} connected · by URL, or a command that runs on your agent's computer`}
        items={mcp}
        onAdd={() => setCreating("mcp")}
        addLabel="Add server"
        onOpen={setSelected}
        loading={loading && !data}
      />
      <Section title="Custom APIs" subtitle="Any HTTP API with a saved key, called by the agent through one HTTP tool" items={apis} onAdd={() => setCreating("api")} addLabel="Add API" onOpen={setSelected} loading={loading && !data} />
      {selected ? <ConnectorDialog connector={selected} onClose={() => setSelected(null)} /> : null}
      {creating ? <CustomConnectorDialog mode={creating} onClose={() => setCreating(null)} /> : null}
      {channel ? <ChannelDialog channel={channel} onClose={() => setChannel(null)} /> : null}
    </div>
  );
}
