"use client";

/** Popover panel styled like the app's floating surfaces. */
import * as RadixPopover from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "./cn";
import { MENU_SURFACE, usePortalThemeClass } from "./theme";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({ className, sideOffset = 4, collisionPadding = 4, ...props }: ComponentProps<typeof RadixPopover.Content>) {
  const theme = usePortalThemeClass();
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(theme, MENU_SURFACE, "z-50 rounded-[12px] font-sans text-[14px] leading-[20px] antialiased outline-none [font-synthesis:none]", className)}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
