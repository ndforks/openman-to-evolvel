// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** "Questions": an accordion with one answer open at a time; the first starts open. */
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { brand } from "@/config/brand";
import { Section, SectionHeading } from "./section";

const name = brand.name;

const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: `What does ${name} cost a team?`,
    answer: `${name} itself is free and open source. Each person signs in with Orgo and pays Orgo for what they use, from credits or a plan. The pricing page lists the plans.`,
  },
  {
    question: "Can teammates see each other's tasks?",
    answer: `Not yet. Tasks, projects and knowledge stay with whoever made them. To show someone your work, send a share link; they can read and replay it without signing in.`,
  },
  {
    question: "Can we all use one Orgo account?",
    answer: `Orgo plans come with teammate seats on the Orgo workspace, managed in Orgo. Inside ${name}, everyone signs in as themselves and only sees their own tasks.`,
  },
  {
    question: `Is there SSO or an admin view?`,
    answer: `Not today. You sign in through Orgo, and ${name} has no admin console, audit log or SSO of its own.`,
  },
  {
    question: "Does our data train any models?",
    answer: `No. Your content is never used for training. Model calls go through Orgo's proxy to Anthropic, and the privacy policy names every provider that touches your data.`,
  },
  {
    question: `Is ${name} certified?`,
    answer: `${name} has no SOC 2 or ISO certification of its own. The security page describes how data is stored and protected.`,
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <Section className="flex flex-col gap-[20px] pt-16 pb-20 md:pt-[110px] md:pb-[120px]">
      <div className="pb-[8px]">
        <SectionHeading>Questions</SectionHeading>
      </div>
      {QUESTIONS.map((item, index) => {
        const open = openIndex === index;
        const panelId = `team-faq-panel-${index}`;
        const buttonId = `team-faq-button-${index}`;
        return (
          <div key={item.question} className="border-b border-black/8 py-[18px]">
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
                className="flex w-full items-start justify-between gap-4 text-left text-[16px] leading-[20px] font-medium text-[var(--om-text-1)]"
              >
                <span>{item.question}</span>
                <span className="flex h-[20px] shrink-0 items-center">
                  {open ? <Minus size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!open}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="pt-[10px] text-[14px] leading-[21px] text-[var(--om-text-3)]">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </Section>
  );
}
