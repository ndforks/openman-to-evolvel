// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Settings → Computers: the real cloud computers (the same live list as the Computers page), each opening its
 * detail page (terminal, monitoring, size, backups, SSH). Local computers need a desktop app that does not
 * exist yet, so that section is left out.
 */
import type { ReactNode } from "react";
import { CloudComputerList, MonitorArt } from "@/components/pages/computers/CloudComputerList";
import { useComputers } from "@/components/pages/computers/useComputers";
import { Button, DIVIDER, Pane, cn } from "@/components/settings/ui";
import { useUI } from "@/lib/ui-store";

/** Empty card: min 198px, 25px vertical padding, drawing, 14/20 headline and help, then the action. */
function EmptyCard({ art, title, description, action }: { art: ReactNode; title: string; description: string; action: ReactNode }) {
  return (
    <div className={cn("flex min-h-[198px] shrink-0 flex-col items-center justify-center gap-[10px] rounded-[12px] border px-[16px] py-[25px] text-center", DIVIDER)}>
      {art}
      <div className="flex w-full max-w-[400px] flex-col items-center gap-[12px]">
        <div className="flex flex-col gap-[4px] text-[14px] leading-[20px]">
          <p className="font-medium text-[var(--om-text-1)]">{title}</p>
          <p className="text-[var(--om-text-3)]">{description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-[8px]">{action}</div>
      </div>
    </div>
  );
}

export default function ComputersTab() {
  const open = useUI((s) => s.open);
  // Real computers from Orgo, with live status. Until the first answer the empty state is not shown, so it cannot flash.
  const { computers: cloud, loaded, notice } = useComputers();

  const createCloud = () => open("customize-computer");

  return (
    <Pane title="Computers">
      <div className="flex items-center justify-between gap-[12px] pb-[8px] pt-[24px]">
        <h3 className="flex min-h-[32px] items-center text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">Cloud computers</h3>
        {cloud.length > 0 ? (
          <Button onClick={createCloud}>
            Create new
          </Button>
        ) : null}
      </div>
      {cloud.length > 0 ? (
        <CloudComputerList computers={cloud} density="compact" />
      ) : !loaded ? (
        <div aria-busy="true" aria-label="Loading your computers" className={cn("h-[58px] shrink-0 animate-pulse rounded-[12px] border bg-[var(--om-card)]", DIVIDER)} />
      ) : (
        <EmptyCard
          art={<MonitorArt />}
          title="No computers yet"
          description="Spin up a cloud machine that stays on, so the agent can keep working while you are away."
          action={<Button className="px-[10px] leading-[20px]" onClick={createCloud}>Create one</Button>}
        />
      )}
      {notice ? (
        <p role="status" className="pt-[8px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
          {notice}
        </p>
      ) : null}

    </Pane>
  );
}
