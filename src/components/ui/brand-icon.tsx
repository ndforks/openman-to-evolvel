// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** A logo from `public/` drawn as a background image, so it scales to any box without layout shift. */
import type { CSSProperties } from "react";
import { cn } from "./cn";

export interface BrandIconProps {
  /** Path under `public/`, e.g. "/brands/figma-c.svg". */
  src: string;
  /** Square size in px, or explicit width and height. */
  size?: number;
  width?: number;
  height?: number;
  /** Accessible name. Omit for decorative logos. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function BrandIcon({ src, size = 14, width, height, label, className, style }: BrandIconProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block shrink-0 bg-contain bg-center bg-no-repeat", className)}
      style={{ width: width ?? size, height: height ?? size, backgroundImage: `url(${src})`, ...style }}
    />
  );
}
