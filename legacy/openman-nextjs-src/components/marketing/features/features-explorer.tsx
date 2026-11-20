// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The whole Features page below the promo banner: hero with the search field, the category
 * navigation and the card sections. Typing in the search field filters cards by title and description.
 */
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { brand } from "@/config/brand";
import { SignInTrigger } from "@/components/marketing/sign-in-trigger";
import { FeatureArt } from "./art";
import { CategoryIcon, SearchIcon } from "./icons";
import { featureSections, filterSections } from "./data";
import type { CategoryId, ConnectorCardData, FeatureCardData, FeatureSectionData } from "./data";

/** Width from which the category navigation sits in the left column (Tailwind `lg`). */
const DESKTOP_MIN_WIDTH = 1024;

/** Covers the card so the whole surface is one control: sign-in modal when signed out, the app otherwise. */
function CardAction({ label }: { label: string }) {
  return (
    <SignInTrigger
      aria-label={label}
      className="absolute inset-0 cursor-pointer rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--om-border-focus)]"
    />
  );
}

function FeatureCard({ card }: { card: FeatureCardData }) {
  return (
    <div className="group relative flex h-[276px] min-w-0 flex-col overflow-clip rounded-[20px] bg-[rgba(55,53,47,0.06)] transition-colors hover:bg-[rgba(55,53,47,0.08)]">
      <div className="px-[24px] pt-[24px]">
        <h3 className="text-[19px] font-medium leading-[27px] text-[#34322D]">{card.title}</h3>
        <p className="mt-[6px] text-[16px] leading-[24px] text-[#5E5E5B]">{card.description}</p>
      </div>
      <div
        aria-hidden
        className="flex grow basis-0 items-end justify-center pb-[20px] pt-[28px] transition-transform duration-300 ease-out group-hover:-translate-y-2"
      >
        <FeatureArt id={card.art} />
      </div>
      <CardAction label={card.title} />
    </div>
  );
}

function ConnectorCard({ card }: { card: ConnectorCardData }) {
  return (
    <div className="relative flex h-full min-w-0 flex-col gap-[10px] rounded-[20px] bg-[rgba(55,53,47,0.06)] p-[24px] transition-colors hover:bg-[rgba(55,53,47,0.08)]">
      <div aria-hidden className="flex size-[40px] shrink-0 items-center justify-center rounded-[10px] bg-white">
        {card.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG logo
          <img src={card.logo} alt="" className="size-[22px]" />
        ) : (
          <span className="text-[18px] leading-[22px] text-[#4D4D4D]">+</span>
        )}
      </div>
      <h3 className="text-[19px] font-medium leading-[27px] text-[#34322D]">{card.title}</h3>
      <p className="text-[16px] leading-[24px] text-[#5E5E5B]">{card.description}</p>
      <CardAction label={card.title} />
    </div>
  );
}

function Section({ section }: { section: FeatureSectionData }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-[136px] lg:scroll-mt-[96px]">
      <h2
        id={`${section.id}-heading`}
        className="font-serif text-[28px] leading-[36px] tracking-[-0.02em] text-[#34322D] md:text-[34px] md:leading-[42px]"
      >
        {section.heading}
      </h2>
      <ul className="mt-[32px] grid grid-cols-1 gap-[20px] sm:grid-cols-2 lg:grid-cols-3">
        {section.cards.map((card) => (
          <li key={card.id} className="min-w-0">
            {card.kind === "feature" ? <FeatureCard card={card} /> : <ConnectorCard card={card} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface CategoryNavProps {
  sections: FeatureSectionData[];
  activeId: CategoryId | null;
  onJump: (event: MouseEvent<HTMLAnchorElement>, id: CategoryId) => void;
  label: string;
  className?: string;
}

/** A vertical list on desktop; a row of pills that scrolls sideways on smaller screens. */
function CategoryNav({ sections, activeId, onJump, label, className }: CategoryNavProps) {
  return (
    <nav
      aria-label={label}
      className={`flex gap-2 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-[4px] lg:overflow-visible [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
    >
      {sections.map((section) => {
        const active = section.id === activeId;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active ? "true" : undefined}
            onClick={(event) => onJump(event, section.id)}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border border-[var(--om-border)] px-4 py-2 text-[16px] font-medium leading-[22px] transition-colors lg:h-[46px] lg:gap-[12px] lg:rounded-[12px] lg:border-0 lg:px-[16px] lg:py-[12px] ${
              active
                ? "bg-[rgba(55,53,47,0.08)] text-[#34322D]"
                : "text-[#5E5E5B] hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322D]"
            }`}
          >
            <CategoryIcon id={section.id} />
            {section.nav}
          </a>
        );
      })}
    </nav>
  );
}

export function FeaturesExplorer() {
  const [query, setQuery] = useState("");
  const [scrolledTo, setScrolledTo] = useState<CategoryId | null>(null);

  const sections = filterSections(query);
  const activeId = sections.some((section) => section.id === scrolledTo) ? scrolledTo : (sections[0]?.id ?? null);

  // Highlight the category whose section has reached the top of the viewport.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Just below the sticky site header (and the sticky pill row on small screens).
      const line = window.innerWidth >= DESKTOP_MIN_WIDTH ? 120 : 160;
      let current: CategoryId | null = null;
      for (const { id } of featureSections) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= line) current = id;
      }
      setScrolledTo(current);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    // Capture phase: scroll events do not bubble, and the page may scroll inside a container.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: CategoryId) {
    const element = document.getElementById(id);
    if (!element) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setScrolledTo(id);
  }

  return (
    <>
      <section className="flex flex-col items-center px-5 pb-10 pt-14 text-center md:px-6 md:pb-[64px] md:pt-[96px]">
        <h1 className="max-w-[860px] font-serif text-[44px] leading-[1.06] tracking-[-0.04em] text-[#34322D] [text-wrap:balance] md:text-[72px] md:leading-[76.32px]">
          What {brand.name} can do
        </h1>
        <p className="mt-[24px] max-w-[640px] text-[17px] leading-[27px] text-[#5E5E5B] md:text-[20px] md:leading-[32px]">
          A plain list of what works today. The agent builds and hosts sites, produces documents, reads the web for you, runs
          jobs on a schedule and works inside the apps you connect.
        </p>
        <label className="mt-[40px] flex h-[56px] w-full max-w-[560px] shrink-0 items-center gap-[12px] rounded-full border border-[rgba(0,0,0,0.06)] bg-white pl-[20px] pr-[8px] text-[var(--om-icon-2)] shadow-[0px_4px_16px_#0000000F] transition-colors focus-within:border-[var(--om-border-focus)]">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter this list"
            aria-label="Search features"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] leading-[25.5px] text-[#34322D] outline-none placeholder:text-[var(--om-text-4)] [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </section>

      <div className="mx-auto flex w-full max-w-[1180px] items-start gap-[48px] px-5 md:px-6">
        <aside className="sticky top-[96px] hidden w-[208px] shrink-0 lg:block">
          <CategoryNav sections={sections} activeId={activeId} onJump={jumpTo} label="Feature categories" />
        </aside>

        <div className="min-w-0 flex-1">
          {sections.length > 0 && (
            <CategoryNav
              sections={sections}
              activeId={activeId}
              onJump={jumpTo}
              label="Feature categories"
              className="sticky top-[56px] z-10 -mx-5 bg-[var(--om-bg)] px-5 py-3 md:-mx-6 md:px-6 lg:hidden"
            />
          )}

          <div className="mt-6 flex flex-col gap-[104px] pb-20 lg:mt-0 lg:pb-[112px]">
            {sections.map((section) => (
              <Section key={section.id} section={section} />
            ))}
            {sections.length === 0 && (
              <p role="status" className="py-[40px] text-[15px] leading-[22px] text-[var(--om-text-2)]">
                Nothing matches that search
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
