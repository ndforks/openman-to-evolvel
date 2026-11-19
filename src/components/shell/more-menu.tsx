"use client";

/** The sidebar's "More" row and the menu it opens to the right. */
import Link from "next/link";
import { ComputerUseIcon, MoreIcon, PersonalizationIcon, PuzzleIcon, type IconComponent } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { SidebarRowContent, sidebarRowClass } from "./sidebar-row";

export const MORE_ITEMS: readonly { href: string; label: string; icon: IconComponent }[] = [
  { href: "/app/computer-use", label: "Computer Use", icon: ComputerUseIcon },
  { href: "/app/skills", label: "Skills", icon: PuzzleIcon },
  { href: "/app/personalization", label: "Personalization", icon: PersonalizationIcon },
];

export function MoreMenu({ active, collapsed }: { active: boolean; collapsed: boolean }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={sidebarRowClass({ active, collapsed })}>
          <SidebarRowContent icon={MoreIcon} label="More" collapsed={collapsed} />
        </button>
      </MenuTrigger>
      {/* 190 px wide, on the darker menu fill, opening beside the row. */}
      <MenuContent side="right" align="start" sideOffset={4} className="w-[190px] min-w-[110px] bg-[var(--om-surface-sunken)]">
        {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
          <MenuItem key={href} asChild>
            <Link href={href}>
              <span className="flex size-[20px] shrink-0 items-center justify-center">
                <Icon size={16} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </Link>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
