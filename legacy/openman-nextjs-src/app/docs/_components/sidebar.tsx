// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Docs navigation: a search field over every page title and heading, then the page list by group.
 * On phones it folds into a "Menu" disclosure above the article.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, Search, X } from "lucide-react";
import type { DocGroup } from "../_lib/manifest";

export interface SearchEntry {
  /** Page URL, with `#heading` for a section. */
  href: string;
  /** What matched: the page title or a heading. */
  label: string;
  /** The page a heading belongs to; empty for the page itself. */
  page: string;
}

const MAX_RESULTS = 12;

function Results({ entries, query, onPick }: { entries: SearchEntry[]; query: string; onPick: () => void }) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = entries.filter((entry) => terms.every((term) => `${entry.label} ${entry.page}`.toLowerCase().includes(term))).slice(0, MAX_RESULTS);
  if (hits.length === 0) {
    return <p className="px-[10px] py-[8px] text-[13px] leading-[18px] text-[var(--om-text-3)]">Nothing in the docs matches “{query}”.</p>;
  }
  return (
    <ul aria-label="Search results" className="flex flex-col">
      {hits.map((hit) => (
        <li key={hit.href}>
          <Link href={hit.href} onClick={onPick} className="flex flex-col rounded-[8px] px-[10px] py-[6px] transition-colors hover:bg-[var(--om-fill)]">
            <span className="text-[14px] leading-[20px] text-[var(--om-text-1)]">{hit.label}</span>
            {hit.page ? <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">{hit.page}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NavList({ groups, activeSlug, query, setQuery, entries, onPick }: {
  groups: DocGroup[];
  activeSlug: string;
  query: string;
  setQuery: (value: string) => void;
  entries: SearchEntry[];
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col gap-[20px]">
      <div className="relative">
        <Search size={15} aria-hidden className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--om-text-3)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the docs"
          aria-label="Search docs"
          className="h-[34px] w-full rounded-[10px] border border-[var(--om-border)] bg-[var(--om-surface)] pl-[32px] pr-[30px] text-[14px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-[6px] top-1/2 flex size-[22px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-text-3)] hover:bg-[var(--om-fill)]">
            <X size={13} aria-hidden />
          </button>
        ) : null}
      </div>
      {query.trim() ? (
        <Results entries={entries} query={query.trim()} onPick={onPick} />
      ) : (
        groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-[2px]">
            <h2 className="px-[10px] pb-[4px] text-[12px] font-medium uppercase leading-[16px] tracking-[0.04em] text-[var(--om-text-3)]">{group.title}</h2>
            {group.pages.map((page) => {
              const active = page.slug === activeSlug;
              return (
                <Link
                  key={page.slug}
                  href={page.slug ? `/docs/${page.slug}` : "/docs"}
                  aria-current={active ? "page" : undefined}
                  onClick={onPick}
                  className={clsx(
                    "rounded-[8px] px-[10px] py-[5px] text-[14px] leading-[20px] transition-colors",
                    active ? "bg-[var(--om-fill-strong)] font-medium text-[var(--om-text-1)]" : "text-[var(--om-text-2)] hover:bg-[var(--om-fill)]",
                  )}
                >
                  {page.title}
                </Link>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

export function DocsSidebar({ groups, activeSlug, entries }: { groups: DocGroup[]; activeSlug: string; entries: SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const activeTitle = useMemo(() => groups.flatMap((group) => group.pages).find((page) => page.slug === activeSlug)?.title ?? "Docs", [groups, activeSlug]);
  const props = { groups, activeSlug, query, setQuery, entries };

  return (
    <>
      {/* Desktop: sticky column. */}
      <nav aria-label="Docs" className="sticky top-[112px] hidden max-h-[calc(100dvh-136px)] w-[232px] shrink-0 overflow-y-auto pb-[24px] pr-[8px] lg:block">
        <NavList {...props} onPick={() => setQuery("")} />
      </nav>
      {/* Phones and tablets: a disclosure above the article. */}
      <div className="w-full lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="docs-mobile-nav"
          onClick={() => setOpen((value) => !value)}
          className="flex h-[40px] w-full cursor-pointer items-center justify-between rounded-[10px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[12px] text-[14px] font-medium text-[var(--om-text-1)]"
        >
          <span>
            <span className="text-[var(--om-text-3)]">Docs / </span>
            {activeTitle}
          </span>
          <ChevronDown size={16} aria-hidden className={clsx("transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <nav id="docs-mobile-nav" aria-label="Docs" className="mt-[8px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-bg)] p-[12px]">
            <NavList
              {...props}
              onPick={() => {
                setQuery("");
                setOpen(false);
              }}
            />
          </nav>
        ) : null}
      </div>
    </>
  );
}
