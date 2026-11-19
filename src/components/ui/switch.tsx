"use client";

/** Medium switch: a 26 x 16 track with a 14 px thumb. */
import * as RadixSwitch from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Switch({ className, ...props }: ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn(
        "block h-[16px] w-[26px] shrink-0 cursor-pointer rounded-[16px] bg-[var(--om-icon-disabled)] px-[1px] outline-none transition-colors data-[state=checked]:bg-[var(--om-icon-accent)]",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="pointer-events-none block size-[14px] translate-y-[1px] rounded-full bg-[var(--om-icon-on-accent)] transition-transform data-[state=checked]:translate-x-[10px]" />
    </RadixSwitch.Root>
  );
}
