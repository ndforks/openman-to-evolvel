// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Square, borderless button that holds one icon. Give it an `aria-label`. */
import type { ComponentProps } from "react";
import { cn } from "./cn";

export interface IconButtonProps extends ComponentProps<"button"> {
  /** Hit area in px (default 28). */
  size?: number;
}

export function IconButton({ size = 28, className, style, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)] disabled:cursor-default disabled:opacity-50 data-[state=open]:bg-[var(--om-fill)] data-[state=open]:text-[var(--om-icon-1)]",
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...props}
    />
  );
}
