// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/shell/top-bar";
import type { AutomationView } from "@/lib/automations/types";
import { AUTOMATIONS_HREF } from "../routes";
import { PageShell } from "../ui";
import { automationsApi } from "./api";
import { ScheduleEditor, TriggerEditor } from "./Editors";

/** Edit screen: the editor for the automation's shape, filled in. */
export function EditAutomation({ id }: { id: string }) {
  const router = useRouter();
  const [a, setA] = useState<AutomationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    automationsApi
      .get(id)
      .then((r) => setA(r.automation))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the automation."));
  }, [id]);
  const close = () => router.push(`${AUTOMATIONS_HREF}?tab=manage`);
  return (
    <PageShell bare className="items-center">
      <TopBar />
      <div className="flex w-full min-w-0 flex-1 flex-col items-center px-[22px]">
        <h2 className="pb-[40px] pt-[48px] text-center font-serif text-[34px] font-normal leading-[40px] text-[var(--om-text-1)]">Edit automation</h2>
        {error ? <p className="text-[13px] text-[var(--om-danger)]">{error}</p> : null}
        {a ? a.repeat && a.triggers.length === 0 ? <ScheduleEditor initial={a} onClose={close} /> : <TriggerEditor initial={a} kind={a.kind === "advanced" ? "advanced" : "trigger"} onClose={close} /> : null}
      </div>
    </PageShell>
  );
}
