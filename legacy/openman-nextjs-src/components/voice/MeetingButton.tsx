// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Composer icon that opens meeting recording (`/app/meeting`). Mount it in the composer's right-hand
 * button group, next to the mic button.
 */
import { AudioLines } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { Tooltip } from "@/components/ui/tooltip";

export const MEETING_HREF = "/app/meeting";

export function MeetingButton({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <Tooltip label="Record meeting">
      <Link
        href={MEETING_HREF}
        aria-label="Record meeting"
        data-testid="meeting-button"
        className={cn(
          "flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]",
          className,
        )}
      >
        <AudioLines size={size} />
      </Link>
    </Tooltip>
  );
}
