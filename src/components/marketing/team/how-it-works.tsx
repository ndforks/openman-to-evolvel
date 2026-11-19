// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** "… in a team": five pill tabs over one panel with copy on the left and a mock workspace on the right. */
import { useState } from "react";
import { brand } from "@/config/brand";
import { Section, SectionHeading } from "./section";

interface Tab {
  id: string;
  label: string;
  body: string;
}

const TABS: Tab[] = [
  {
    id: "share",
    label: "Share by link",
    body: "Turn any task into a read-only link, replay included if you like. Whoever opens it sees the steps and files, no account required.",
  },
  {
    id: "stack",
    label: "Your apps, connected",
    body: `Hook up the tools the team relies on through Orgo and Composio, or point ${brand.name} at your own MCP servers and APIs.`,
  },
  {
    id: "anywhere",
    label: "Browser only",
    body: "No app to install. Kick off and check on tasks from a laptop, tablet or phone in any modern browser.",
  },
  {
    id: "automate",
    label: "Recurring jobs",
    body: "Start tasks on a timer, from a webhook or when a feed changes. Every run is logged, and failed runs are retried.",
  },
  {
    id: "skills",
    label: "Shared know-how",
    body: "Add any of the 55 library skills, upload your own, or save a task that went well as a skill for next time.",
  },
];

const TEAMMATE_COLORS = ["#FCD34D", "#7DD3FC", "#A3E635"];

/** Placeholder workspace window. The highlighted sidebar row follows the selected tab. */
function WorkspaceMock({ activeRow }: { activeRow: number }) {
  const rows = [70, 90, 60, 80];
  return (
    <div className="flex h-[240px] w-full rounded-t-[12px] bg-white shadow-[0px_10px_30px_#00000014] md:h-[320px]">
      <div className="flex w-[100px] shrink-0 flex-col gap-[10px] border-r border-black/6 p-[14px] sm:w-[140px]">
        {rows.map((width, index) => (
          <div
            key={index}
            className={`h-[8px] max-w-full shrink-0 rounded-[4px] transition-colors ${index === activeRow % rows.length ? "bg-[#E6E6E6]" : "bg-[#EEEEEE]"}`}
            style={{ width }}
          />
        ))}
      </div>
      <div className="flex min-w-0 grow basis-0 flex-col gap-[12px] p-[18px]">
        <div className="h-[12px] w-[200px] max-w-full shrink-0 rounded-[4px] bg-[#E6E6E6]" />
        <div className="flex gap-[8px]">
          {TEAMMATE_COLORS.map((color) => (
            <div key={color} className="size-[26px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
          ))}
        </div>
        <div className="h-[140px] shrink-0 rounded-[8px] bg-[#F6F6F5]" />
      </div>
    </div>
  );
}

export function HowItWorks() {
  const [activeId, setActiveId] = useState(TABS[0].id);
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.id === activeId),
  );
  const active = TABS[activeIndex];

  return (
    <Section className="flex flex-col items-center gap-[28px] pt-16 md:pt-[110px]">
      <SectionHeading className="text-center">{brand.name} in a team</SectionHeading>
      <div role="tablist" aria-label={`${brand.name} in a team`} className="flex flex-wrap justify-center gap-[6px]">
        {TABS.map((tab) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`team-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="team-tabpanel"
              onClick={() => setActiveId(tab.id)}
              className={`rounded-[100px] px-[16px] py-[10px] text-[14px] leading-[20px] whitespace-pre transition-colors ${
                selected
                  ? "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]"
                  : "bg-[var(--om-fill)] text-[var(--om-text-2)] hover:bg-[var(--om-fill-strong)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id="team-tabpanel"
        aria-labelledby={`team-tab-${active.id}`}
        className="flex w-full flex-col overflow-hidden rounded-[16px] bg-[#E7E4DF] md:h-[420px] md:flex-row"
      >
        <div className="flex shrink-0 flex-col justify-end gap-[10px] p-6 md:w-[300px] md:p-[40px]">
          <h3 className="text-[22px] leading-[28px] font-semibold tracking-[-0.02em] text-[var(--om-text-1)]">{active.label}</h3>
          <p className="text-[14px] leading-[21px] text-[var(--om-text-3)]">{active.body}</p>
        </div>
        <div className="flex min-w-0 grow basis-0 items-end px-6 pt-2 md:px-0 md:pt-[40px] md:pr-[40px]">
          <WorkspaceMock activeRow={activeIndex} />
        </div>
      </div>
    </Section>
  );
}
