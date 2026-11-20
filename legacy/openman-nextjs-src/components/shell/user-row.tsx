// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Bottom row of the sidebar: who is signed in, the "use anywhere" shortcut and the notifications bell. */
import { brand } from "@/config/brand";
import { cn } from "@/components/ui/cn";
import { BellIcon, DevicesIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { useUI } from "@/lib/ui-store";
import { useShellAccount } from "./account";
import { Avatar } from "./avatar";
import { NotificationsPanel, useNotificationsSync } from "./notifications-panel";
import { UserMenu } from "./user-menu";

/** 28 px square button with an 18 px glyph, for the sidebar footer. */
const FOOTER_BUTTON =
  "flex size-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)] data-[state=open]:bg-[var(--om-fill-subtle)]";

export function UserRow({ collapsed }: { collapsed: boolean }) {
  const account = useShellAccount();
  const open = useUI((s) => s.open);
  const unread = useNotificationsSync();

  // On the rail the same three controls stack: the two buttons, then the avatar at the bottom.
  return (
    <div className={cn("flex w-full shrink-0 items-center justify-between", collapsed ? "flex-col-reverse gap-[4px]" : "pe-[2px]")}>
      <div className={cn("flex min-w-0 flex-1 items-center", collapsed ? "flex-col gap-[4px]" : "ps-[2px]")}>
        <UserMenu account={account}>
          <button
            type="button"
            aria-label={account.name ? `Account menu for ${account.name}` : "Account menu"}
            className="flex min-w-0 cursor-pointer select-none items-center gap-[8px] rounded-[8px] p-[2px] text-left text-[14px] font-medium leading-[20px] text-[var(--om-text-1)] outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70 data-[state=open]:opacity-70"
          >
            <Avatar src={account.avatarUrl} size={28} />
            {collapsed ? null : <span className="min-w-0 truncate">{account.name}</span>}
          </button>
        </UserMenu>
      </div>
      <div className={cn("flex shrink-0 items-center gap-[4px]", collapsed && "flex-col")}>
        <Tooltip label={`Use ${brand.name} anywhere`} side={collapsed ? "right" : "top"}>
          <button type="button" aria-label={`Use ${brand.name} anywhere`} onClick={() => open("use-anywhere")} className={FOOTER_BUTTON}>
            <DevicesIcon size={18} strokeWidth={2} />
          </button>
        </Tooltip>
        <NotificationsPanel>
          <button type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className={cn(FOOTER_BUTTON, "relative")}>
            <BellIcon size={18} strokeWidth={2} />
            {unread ? <span aria-hidden="true" className="absolute end-[4px] top-[4px] size-[7px] rounded-full border border-[var(--om-bg-sidebar)] bg-[var(--om-danger)]" /> : null}
          </button>
        </NotificationsPanel>
      </div>
    </div>
  );
}
