"use client";

/** Dropdown menu styled like the app's menus. Thin wrappers over Radix so keyboard and focus handling come for free. */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "./cn";
import { ChevronRightIcon } from "./icons";
import { MENU_SURFACE, usePortalThemeClass } from "./theme";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;
export const MenuSub = DropdownMenu.Sub;
export const MenuRadioGroup = DropdownMenu.RadioGroup;

/** Menu metrics: 12 px radius, 4 px padding; rows 36 px tall (14/20 text, 8 px padding), 8 px radius, 8 px gap. */
const CONTENT = "z-50 flex flex-col rounded-[12px] p-[4px] font-sans text-[14px] leading-[20px] antialiased outline-none [font-synthesis:none]";
const ITEM =
  "flex min-h-[36px] w-full shrink-0 cursor-pointer select-none items-center gap-[8px] rounded-[8px] px-[8px] py-[8px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--om-fill)]";

export function MenuContent({ className, sideOffset = 4, collisionPadding = 4, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  const theme = usePortalThemeClass();
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={sideOffset} collisionPadding={collisionPadding} className={cn(theme, MENU_SURFACE, CONTENT, className)} {...props} />
    </DropdownMenu.Portal>
  );
}

export function MenuSubContent({ className, collisionPadding = 4, ...props }: ComponentProps<typeof DropdownMenu.SubContent>) {
  const theme = usePortalThemeClass();
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent collisionPadding={collisionPadding} className={cn(theme, MENU_SURFACE, CONTENT, className)} {...props} />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return <DropdownMenu.Item className={cn(ITEM, className)} {...props} />;
}

export function MenuRadioItem({ className, ...props }: ComponentProps<typeof DropdownMenu.RadioItem>) {
  return <DropdownMenu.RadioItem className={cn(ITEM, className)} {...props} />;
}

/** Row that opens a submenu. Pass `chevron={false}` to draw your own trailing content. */
export function MenuSubTrigger({ className, children, chevron = true, ...props }: ComponentProps<typeof DropdownMenu.SubTrigger> & { chevron?: boolean }) {
  return (
    <DropdownMenu.SubTrigger className={cn(ITEM, "data-[state=open]:bg-[var(--om-fill)]", className)} {...props}>
      {children}
      {chevron ? <ChevronRightIcon size={16} className="ml-auto text-[var(--om-icon-3)]" /> : null}
    </DropdownMenu.SubTrigger>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn("px-[8px] py-[6px] text-[13px] leading-[18px] text-[var(--om-text-3)]", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn("mx-[8px] my-[4px] h-px shrink-0 bg-[var(--om-border)]", className)} {...props} />;
}
