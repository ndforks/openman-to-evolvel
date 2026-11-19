"use client";

/** Account menu that opens above the sidebar's user row. */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import {
  BookIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ExternalArrowIcon,
  HelpIcon,
  HomeIcon,
  SettingsIcon,
  SignOutIcon,
  SparkleSingleIcon,
  UserIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { formatCredits, useCredits } from "@/lib/billing";
import { useUI } from "@/lib/ui-store";
import type { ShellAccount } from "./account";
import { Avatar } from "./avatar";

/** Profile menu row: 36 px tall, 8 px radius, a 20 px icon box, 14/20 text. */
const ROW = "h-[36px] min-h-0 gap-[4px] rounded-[8px] px-[8px] py-0 text-[14px] font-normal leading-[20px] data-[highlighted]:bg-[var(--om-fill-subtle)]";
const DIVIDER = "mx-[8px] my-[4px] bg-[var(--om-border)]";

function RowIcon({ icon: Icon }: { icon: IconComponent }) {
  return (
    <span className="flex size-[20px] shrink-0 items-center justify-center">
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}

const EXTERNAL_LINKS: readonly { label: string; href: string; icon: IconComponent }[] = [
  { label: "Homepage", href: "/?index=1", icon: HomeIcon },
  { label: "Get help", href: "/docs/getting-started", icon: HelpIcon },
  { label: "Docs", href: "/docs", icon: BookIcon },
];

export function UserMenu({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const open = useUI((s) => s.open);
  // The same Orgo balance the credits pill shows.
  const { balanceCents } = useCredits();
  const credits = balanceCents === null ? account.credits : formatCredits(balanceCents);

  return (
    <Menu>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuContent side="top" align="start" sideOffset={4} className="w-[284px] min-w-[110px] p-[4px]">
        <div className="flex w-full items-center gap-[8px] rounded-[8px] px-[8px] py-[8px]">
          <div className="flex min-w-0 flex-1 items-center gap-[8px]">
            <Avatar src={account.avatarUrl} size={28} className="border border-[var(--om-border)]" />
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <span className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{account.name}</span>
              <span className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">{account.workspace}</span>
            </div>
          </div>
          <ChevronsUpDownIcon size={16} className="shrink-0 text-[var(--om-icon-3)]" />
        </div>

        <div className="py-[4px]">
          <div className="flex w-full flex-col rounded-[8px] bg-[var(--om-fill-subtle)]">
            <div className="flex w-full items-center justify-between gap-[8px] py-[8px] pe-[8px] ps-[12px]">
              <span className="min-w-0 flex-1 truncate whitespace-nowrap font-serif text-[14px] font-bold leading-[20px] text-[var(--om-text-1)]">{account.plan}</span>
              <MenuItem
                onSelect={() => open("upgrade-pro")}
                className="h-[28px] min-h-0 w-auto min-w-[56px] justify-center rounded-[8px] bg-[var(--om-btn-primary)] px-[8px] py-0 text-[13px] font-medium leading-[18px] tracking-[-0.08px] text-[var(--om-text-inverse)] data-[highlighted]:bg-[var(--om-btn-primary)] data-[highlighted]:opacity-90"
              >
                Upgrade
              </MenuItem>
            </div>
            <MenuItem onSelect={() => open("settings", { tab: "billing" })} className="min-h-0 gap-[4px] rounded-[8px] px-[8px] py-[8px] tracking-[-0.15px]">
              <span className="flex min-w-0 flex-1 items-center gap-[4px]">
                <RowIcon icon={SparkleSingleIcon} />
                <span className="flex min-w-0 items-center gap-[4px] ps-[4px]">
                  <span className="truncate">Credits</span>
                  <HelpIcon size={14} strokeWidth={2} className="shrink-0 text-[var(--om-icon-3)]" />
                </span>
              </span>
              <span className="flex shrink-0 items-center justify-end gap-[4px]">
                <span className="text-[var(--om-text-3)]">{credits}</span>
                <ChevronRightIcon size={16} className="text-[var(--om-icon-3)]" />
              </span>
            </MenuItem>
          </div>
        </div>

        <MenuItem onSelect={() => open("settings", { tab: "account" })} className={ROW}>
          <RowIcon icon={UserIcon} />
          <span className="min-w-0 flex-1 truncate px-[4px]">Account</span>
        </MenuItem>
        <MenuItem onSelect={() => open("settings")} className={ROW}>
          <RowIcon icon={SettingsIcon} />
          <span className="min-w-0 flex-1 truncate px-[4px]">Settings</span>
        </MenuItem>

        <MenuSeparator className={DIVIDER} />

        {EXTERNAL_LINKS.map(({ label, href, icon }) => (
          <MenuItem key={label} asChild className={ROW}>
            <a href={href} target="_blank" rel="noreferrer">
              <RowIcon icon={icon} />
              <span className="min-w-0 flex-1 truncate px-[4px]">{label}</span>
              <ExternalArrowIcon size={16} className="text-[var(--om-icon-3)]" />
            </a>
          </MenuItem>
        ))}

        <MenuSeparator className={DIVIDER} />

        <MenuItem onSelect={() => void account.signOut()} className={cn(ROW, "text-[var(--om-danger)]")}>
          <RowIcon icon={SignOutIcon} />
          <span className="min-w-0 flex-1 truncate px-[4px]">Sign out</span>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
