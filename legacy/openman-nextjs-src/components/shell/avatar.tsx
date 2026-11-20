// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Round user avatar. Falls back to the default blue silhouette when there is no picture. */
import { cn } from "@/components/ui/cn";

export function Avatar({ src, size = 26, className }: { src?: string | null; size?: number; className?: string }) {
  if (src) {
    return (
      <span
        aria-hidden="true"
        className={cn("block shrink-0 rounded-full bg-cover bg-center", className)}
        style={{ width: size, height: size, backgroundImage: `url(${JSON.stringify(src)})` }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("relative flex shrink-0 items-end justify-center overflow-clip rounded-full bg-[#5B8DEF]", className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute rounded-full bg-[#C9DBFF]" style={{ width: size * 0.34, height: size * 0.34, top: size * 0.22 }} />
      <span className="block rounded-t-[8px] bg-[#C9DBFF]" style={{ width: size * 0.62, height: size * 0.35 }} />
    </span>
  );
}
