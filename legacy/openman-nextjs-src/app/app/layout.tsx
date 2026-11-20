// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { Suspense, type ReactNode } from "react";
import { ModalHost } from "@/components/modals/host";
import { EpochGuard } from "@/components/shell/epoch-guard";
import { SetupGate } from "@/components/shell/setup-gate";
import { Sidebar, SidebarFallback } from "@/components/shell/sidebar";
import { LinkGuard } from "@/components/ui/link-guard";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Frame of the logged-in app: sidebar on the left, the page on the right, modals on top.
 * The wrapper carries the `dark` class, so everything inside reads the dark tokens.
 * `data-app-root` lets portalled menus find it and copy its theme.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-app-root=""
      data-theme-root=""
      className="dark flex h-dvh w-full overflow-hidden bg-[var(--om-bg)] font-sans text-[var(--om-text-1)] dark:[color-scheme:dark]"
    >
      <TooltipProvider delayDuration={300}>
        {/* The sidebar reads the URL, which is unknown while a dynamic route is prerendered. */}
        <Suspense fallback={<SidebarFallback />}>
          <Sidebar />
        </Suspense>
        <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          {/* First run: setup of the home computer replaces the page until it is ready. */}
          <Suspense fallback={children}>
            <SetupGate>{children}</SetupGate>
          </Suspense>
        </main>
        <Suspense fallback={null}>
          <ModalHost />
        </Suspense>
        <Toaster />
        <LinkGuard />
        <EpochGuard />
      </TooltipProvider>
    </div>
  );
}
