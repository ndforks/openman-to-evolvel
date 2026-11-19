/** "What sets … apart": four alternating blocks, each pairing an illustration with a short explanation. */
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { Section, SectionHeading } from "./section";
import {
  ModelRoutingIllustration,
  OutputsIllustration,
  PrototypeIllustration,
  ComputerIllustration,
} from "./illustrations";

interface Block {
  title: string;
  body: string;
  illustration: ReactNode;
  /** Which side the illustration sits on from the `md` breakpoint up. */
  side: "left" | "right";
}

const BLOCKS: Block[] = [
  {
    title: "The right model for the job",
    body: `Choose per task: ${brand.modes.lite.label} uses Claude Haiku, ${brand.modes.standard.label} uses Sonnet and ${brand.modes.max.label} uses Opus. Model use comes out of your Orgo credits at list price plus 10%.`,
    illustration: <ModelRoutingIllustration />,
    side: "left",
  },
  {
    title: "Files, not just answers",
    body: "When a task ends you get the documents, sheets and decks it produced, ready to open, download or pass on.",
    illustration: <OutputsIllustration />,
    side: "right",
  },
  {
    title: "From a sentence to a working site",
    body: "Describe an internal tool or a landing page. It gets built on your cloud computer, previewed for you, then published to a public URL.",
    illustration: <PrototypeIllustration />,
    side: "left",
  },
  {
    title: "Its own machine, in plain view",
    body: "Work happens on your Orgo computer, with a real browser and shell. You can watch every step and take the wheel at any point.",
    illustration: <ComputerIllustration />,
    side: "right",
  },
];

export function Difference() {
  return (
    <Section>
      <div className="flex justify-center pt-16 pb-8 md:pt-[88px] md:pb-[44px]">
        <SectionHeading className="text-center">What sets {brand.name} apart</SectionHeading>
      </div>
      <div className="flex flex-col gap-[28px]">
        {BLOCKS.map((block) => (
          <div
            key={block.title}
            className={`flex w-full flex-col-reverse overflow-hidden rounded-[16px] md:h-[392px] ${block.side === "left" ? "md:flex-row" : "md:flex-row-reverse"}`}
          >
            <div className="w-full md:w-1/2 md:flex-none">{block.illustration}</div>
            <div className="flex w-full flex-col justify-center gap-[12px] bg-[var(--om-fill-subtle)] px-6 py-8 md:w-1/2 md:flex-none md:px-10 md:py-0 min-[950px]:px-[70px]">
              <h3 className="text-[24px] leading-[30px] font-semibold tracking-[-0.5px] text-[var(--om-text-1)] md:text-[32px] md:leading-[40px]">
                {block.title}
              </h3>
              <p className="text-[14.5px] leading-[21px] text-[var(--om-text-3)]">{block.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
