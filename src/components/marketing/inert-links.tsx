// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Pages that are not part of this build are linked as `href="#"`.
 * Instead of doing nothing (or jumping to the top), such a link says so in a short toast.
 */
import { LinkGuard } from "@/components/ui/link-guard";
import { Toaster } from "@/components/ui/toast";

export function InertLinkToasts() {
  return (
    <>
      <LinkGuard />
      {/* Below the sticky header and the promo banner, so the navigation stays readable. */}
      <Toaster className="top-[104px]" />
    </>
  );
}
