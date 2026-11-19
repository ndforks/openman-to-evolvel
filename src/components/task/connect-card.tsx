// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * A card offered inside a task when the agent needs an app that is not connected. "Connect" opens the real sign-in
 * (Orgo / Composio popup) and the card flips to "Connected" by itself; the user then asks the agent to continue.
 *
 * Mount: `<ConnectCard app="gmail" />` under the agent message or tool result that asked for it.
 * `connectRequestFrom(text)` finds the app in such text (Orgo's tool server answers
 * "<App> isn’t connected yet. Ask the person to connect it…"; the agent is told to name the app it needs).
 */
import { useState } from "react";
import { ConnectorLogo } from "@/components/pages/plugins/connector-ui";
import { cn } from "@/components/modals/ModalShell";
import { CURATED_APPS, logoFor, type ConnectorView } from "@/lib/connectors/catalog";
import { connectApp, useConnectors } from "@/lib/connectors/client";

const NAME_TO_SLUG = new Map(CURATED_APPS.flatMap((a) => [[a.name.toLowerCase(), a.slug] as const, [a.slug, a.slug] as const]));

/** The app slug a piece of agent text asks to connect, or null. */
export function connectRequestFrom(text: string | undefined | null): string | null {
  if (!text) return null;
  // Orgo's own wording first, then how agents phrase it ("Notion isn't connected", "connect Notion in your settings").
  // Only names of apps in the catalog count, so ordinary prose does not raise a card.
  const patterns = [
    /([A-Z][\w .-]{1,40}?) isn[’']t connected yet/g,
    /([A-Z][\w.-]{1,30}(?: [A-Z][\w.-]{1,20})?) (?:isn[’']t|is not|was not|wasn[’']t) connected/g,
    /(?:connect|sign in to|enable|link) (?:the |your )?([A-Z][\w.-]{1,30}(?: [A-Z][\w.-]{1,20})?)(?: connector| app| account|\b)/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const name = m[1].trim().toLowerCase();
      const slug = NAME_TO_SLUG.get(name) ?? NAME_TO_SLUG.get(name.split(" ")[0]);
      if (slug) return slug;
    }
  }
  return null;
}

export function ConnectCard({ app, reason, className }: { app: string; reason?: string; className?: string }) {
  const { data } = useConnectors();
  const curated = CURATED_APPS.find((a) => a.slug === app);
  const live: ConnectorView = data?.connectors.find((c) => c.slug === app) ?? { slug: app, name: curated?.name ?? app, description: curated?.description ?? "", category: curated?.category ?? "Other", logo: curated?.logo ?? logoFor(app), type: "app", connected: false };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    const res = await connectApp(app);
    setBusy(false);
    if (!res.ok && !("cancelled" in res && res.cancelled)) setError(res.error);
  };

  return (
    <div className={cn("flex w-full max-w-[560px] items-center gap-[12px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] p-[12px]", className)}>
      <ConnectorLogo connector={live} tile={40} mark={22} radius={10} />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{live.connected ? `${live.name} is connected` : `Connect ${live.name}`}</div>
        <div className="line-clamp-2 text-[12.5px] leading-[17px] text-[var(--om-text-3)]">{error ?? (live.connected ? "Ask the agent to continue." : (reason ?? `The agent needs ${live.name} for this task.`))}</div>
      </div>
      {live.connected ? (
        <span className="inline-flex shrink-0 items-center gap-[6px] text-[13px] text-[var(--om-text-2)]">
          <span className="size-[7px] rounded-full bg-[var(--om-success)]" /> Connected
        </span>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="inline-flex h-[32px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] bg-[var(--om-btn-primary)] px-[12px] text-[13px] font-medium text-[var(--om-text-inverse)] outline-none hover:opacity-90 disabled:cursor-default disabled:opacity-60"
        >
          {busy ? <span aria-hidden className="size-[12px] animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
          {busy ? "Waiting…" : "Connect"}
        </button>
      )}
    </div>
  );
}
