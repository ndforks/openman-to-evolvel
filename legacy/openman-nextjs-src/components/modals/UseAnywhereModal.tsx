// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * "Reach <brand> from anywhere" panel (280 px wide).
 * It floats above the bottom-left of the sidebar with no dimmed backdrop, so it uses Radix Dialog directly
 * (for focus handling and Esc / outside-click dismissal) rather than the centred `ModalShell`.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { X } from "lucide-react";
import { brand } from "@/config/brand";
import { useChannels } from "@/lib/channels/client";
import type { ChannelId } from "@/lib/channels/types";
import { useUI } from "@/lib/ui-store";
import { ChannelDialog, ChannelLogo, healthLabel } from "./UseAnywhereChannels";
import { cn } from "./ModalShell";
import { useThemeClass } from "./theme";

/*
 * This product runs in the browser and has no apps to download, so the panel lists the places the agent itself
 * works outside the browser: Telegram and Slack (Hermes' gateway on the user's computer), with live link status.
 * A click opens the link dialog in place of the panel.
 */

/** One chat app: its logo, what it is for, and the link status. */
function ChannelRow({ channel, label, blurb, onOpen }: { channel: ChannelId; label: string; blurb: string; onOpen: () => void }) {
  const { data } = useChannels();
  const { text, dot } = healthLabel(data?.[channel]);
  const linked = !!data?.[channel]?.linked;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${text}`}
      className="flex w-full cursor-pointer items-center gap-[10px] rounded-[10px] border border-[var(--om-border)] bg-[var(--om-card)] p-[10px] text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]"
    >
      <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] bg-white">
        <ChannelLogo channel={channel} size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">{label}</span>
        <span className="text-[11px] leading-[15px] text-[var(--om-text-3)]">{blurb}</span>
      </span>
      <span className="flex shrink-0 items-center gap-[4px] text-[10.5px] font-medium leading-[14px] text-[var(--om-text-2)]">
        <span className={cn("size-[6px] rounded-full", linked ? dot : "bg-[#B5B5B5]")} />
        {linked ? text : data ? "Link" : "…"}
      </span>
    </button>
  );
}

export function UseAnywhereModal() {
  const close = useUI((s) => s.close);
  const themeClass = useThemeClass();
  const title = `Reach ${brand.name} from anywhere`;
  const [channel, setChannel] = useState<ChannelId | null>(null);

  if (channel) return <ChannelDialog channel={channel} onClose={close} />;

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            themeClass,
            "fixed bottom-[58px] left-[6px] z-[101] flex w-[280px] flex-col gap-[10px] overflow-hidden rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] px-[10px] pb-[10px] pt-[12px] font-sans text-[12px] leading-[16px] text-[var(--om-text-1)] antialiased shadow-[0_12px_32px_rgba(0,0,0,0.45)] outline-none [font-synthesis:none]",
          )}
        >
          <div className="flex items-center justify-between px-[2px]">
            <Dialog.Title className="text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-m-[4px] flex cursor-pointer items-center justify-center rounded-[6px] p-[4px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]"
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-[6px]">
            <ChannelRow channel="telegram" label="Telegram" blurb="Your own bot for jobs, voice memos and files" onOpen={() => setChannel("telegram")} />
            <ChannelRow channel="slack" label="Slack" blurb="Mention the agent in any channel or DM" onOpen={() => setChannel("slack")} />
          </div>
          <p className="px-[2px] text-[11px] leading-[15px] text-[var(--om-text-3)]">Messages you send there run as normal tasks, on the same computer and with the same memory.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
