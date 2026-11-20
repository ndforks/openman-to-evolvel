// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { brand } from "@/config/brand";
import type { AutomationView, AutomationsMeta } from "@/lib/automations/types";
import { AUTOMATION_KINDS, type AutomationStart } from "../data/automations";
import { NEW_AUTOMATION_HREF } from "../routes";
import { CreateMenu, MenuButton, PageShell, PillTabs, PrimaryButton, type MenuOption } from "../ui";
import { automationsApi } from "./api";
import { AutomationArt } from "./AutomationArt";
import { useAutomationDraft } from "./draft";
import { StartIcon } from "./icons";
import { ManageTab } from "./ManageTab";
import { UpdatesTab } from "./UpdatesTab";

const CREATE_OPTIONS: MenuOption[] = AUTOMATION_KINDS.map((kind) => ({
  id: kind.id,
  label: kind.startTitle,
  description: kind.startDescription,
  badge: kind.beta ? "Beta" : undefined,
  icon: <StartIcon start={kind.id} size={16} />,
}));

type Tab = "updates" | "manage";
const TABS = [
  { id: "updates", label: "Updates" },
  { id: "manage", label: "Manage" },
] as const;

/** Automations: the empty state until the first one exists, then the Updates and Manage tabs. */
export function AutomationsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const setStart = useAutomationDraft((s) => s.setStart);
  const [data, setData] = useState<{ automations: AutomationView[]; meta: AutomationsMeta } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tab: Tab = params.get("tab") === "manage" ? "manage" : "updates";

  const load = useCallback(async () => {
    try {
      setData(await automationsApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load automations.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const create = (start: AutomationStart) => {
    setStart(start);
    router.push(`${NEW_AUTOMATION_HREF}?start=${start}`);
  };

  if (data && data.automations.length === 0) return <EmptyState onCreate={create} />;

  return (
    <PageShell title="Automations" actions={<CreateMenu options={CREATE_OPTIONS} onSelect={(id) => create(id as AutomationStart)} />}>
      <div className="flex w-full flex-col pb-[40px]">
        <div className="flex items-center justify-between pb-[16px] pt-[4px]">
          <PillTabs label="Automations view" tabs={TABS} value={tab} onChange={(id) => router.replace(`?tab=${id}`, { scroll: false })} />
          {data ? (
            <span className="text-[13px] text-[var(--om-text-3)]">
              {data.meta.used} of {data.meta.limit} active
            </span>
          ) : null}
        </div>
        {error ? <p className="py-[8px] text-[13px] text-[var(--om-danger)]">{error}</p> : null}
        {!data ? (
          <div className="flex flex-col gap-[10px]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-[12px] bg-[var(--om-fill-subtle)]" />
            ))}
          </div>
        ) : tab === "updates" ? (
          <UpdatesTab automations={data.automations} />
        ) : (
          <ManageTab automations={data.automations} reload={load} />
        )}
      </div>
    </PageShell>
  );
}

function EmptyState({ onCreate }: { onCreate: (start: AutomationStart) => void }) {
  return (
    <PageShell title="Automations">
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-[32px] pb-[48px] pt-[20px] sm:pb-[112px]">
        <div className="flex w-full flex-col items-center gap-[4px] text-center">
          <h2 className="text-[24px] font-medium leading-[30px] text-[var(--om-text-1)] sm:text-[28px] sm:leading-[34px]">Nothing is automated yet</h2>
          <p className="text-[14px] leading-[20px] text-[var(--om-text-3)]">
            Run a job on a timetable, react when something happens in an app, or spell out a rule for {brand.agentNoun} to follow.
          </p>
        </div>

        <div className="grid w-full max-w-[960px] grid-cols-1 justify-items-center gap-[12px] md:grid-cols-3">
          {AUTOMATION_KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              onClick={() => onCreate(kind.id)}
              className="flex w-full min-w-0 max-w-[400px] cursor-pointer flex-col overflow-hidden rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] text-start outline-none transition-colors hover:border-[var(--om-border-strong)] focus-visible:border-[var(--om-border-focus)]"
            >
              <AutomationArt start={kind.id} />
              <span className="flex w-full flex-1 flex-col gap-[4px] border-t border-[var(--om-border)] p-[16px]">
                <span className="flex flex-wrap items-center gap-[4px]">
                  <span className="text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">{kind.title}</span>
                  {kind.beta ? <span className="flex h-[16px] shrink-0 items-center rounded-[4px] bg-[var(--om-fill)] px-[4px] text-[11px] leading-[14px] text-[var(--om-text-3)]">Beta</span> : null}
                </span>
                <span className="text-[14px] leading-[20px] text-[var(--om-text-2)]">{kind.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div>
          <MenuButton
            align="center"
            width={310}
            options={CREATE_OPTIONS}
            onSelect={(id) => onCreate(id as AutomationStart)}
            trigger={
              <PrimaryButton aria-label="Get started: create an automation" className="h-[36px] w-[310px] min-w-[72px] max-w-full gap-[6px] rounded-[8px] px-[12px]">
                Get started
              </PrimaryButton>
            }
          />
        </div>
      </div>
    </PageShell>
  );
}
