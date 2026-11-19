// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** One docs page: sidebar, title, the Markdown body, previous / next links and the "On this page" list. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { brand } from "@/config/brand";
import { loadDoc } from "../_lib/content";
import { DOC_GROUPS, DOC_PAGES, docHref, findDoc, type DocGroup, type DocPage } from "../_lib/manifest";
import { DocMarkdown } from "./markdown";
import { DocsSidebar, type SearchEntry } from "./sidebar";

/** Pages listed in the manifest whose Markdown exists. */
export function visiblePages(): DocPage[] {
  return DOC_PAGES.filter((page) => loadDoc(page.slug) !== null);
}


function visibleGroups(): DocGroup[] {
  const visible = new Set(visiblePages());
  return DOC_GROUPS.map((group) => ({ ...group, pages: group.pages.filter((page) => visible.has(page)) }));
}

/** Every page title and `##` / `###` heading, for the sidebar search. */
function searchEntries(): SearchEntry[] {
  return visiblePages().flatMap((page) => {
    const href = docHref(page.slug);
    const doc = loadDoc(page.slug);
    return [
      { href, label: page.title, page: "" },
      ...(doc?.headings ?? []).map((heading) => ({ href: `${href}#${heading.id}`, label: heading.text, page: page.title })),
    ];
  });
}

export function docMetadata(slug: string): Metadata {
  const page = findDoc(slug);
  if (!page) return {};
  return {
    title: slug ? `${page.title} | ${brand.name} Docs` : `${brand.name} Docs`,
    description: page.description,
    alternates: { canonical: docHref(slug) },
  };
}

export function DocPageView({ slug }: { slug: string }) {
  const page = findDoc(slug);
  const doc = page ? loadDoc(slug) : null;
  if (!page || !doc) notFound();
  const pages = visiblePages();
  const index = pages.indexOf(page);
  const prev = pages[index - 1];
  const next = pages[index + 1];
  const toc = doc.headings.filter((heading) => heading.depth === 2);

  return (
    <main className="w-full flex-1 bg-[var(--om-bg)] text-[var(--om-text-1)]">
      <div className="mx-auto flex w-full max-w-[1200px] gap-[40px] px-6 pb-[96px] pt-[32px] max-lg:flex-col max-lg:gap-[20px] max-md:px-4 lg:pt-[48px]">
        <DocsSidebar groups={visibleGroups()} activeSlug={slug} entries={searchEntries()} />

        <article className="min-w-0 max-w-[720px] flex-1">
          <p className="text-[13px] font-medium leading-[18px] text-[var(--om-text-3)]">{DOC_GROUPS.find((group) => group.pages.includes(page))?.title}</p>
          <h1 className="mt-[6px] font-serif text-[32px] leading-[40px] tracking-[-0.01em] text-[var(--om-text-1)] md:text-[38px] md:leading-[46px]">
            {slug ? page.title : `${brand.name} docs`}
          </h1>
          <p className="mt-[10px] text-[16px] leading-[24px] text-[var(--om-text-3)]">{page.description}</p>
          <div className="mt-[8px]">
            <DocMarkdown markdown={doc.markdown} />
          </div>

          <nav aria-label="Previous and next pages" className="mt-[48px] grid grid-cols-2 gap-[12px] border-t border-[var(--om-border)] pt-[24px] max-sm:grid-cols-1">
            {prev ? (
              <Link href={docHref(prev.slug)} className="flex flex-col gap-[2px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[14px] transition-colors hover:border-[var(--om-border-focus)]">
                <span className="flex items-center gap-[4px] text-[12px] text-[var(--om-text-3)]">
                  <ArrowLeft size={12} aria-hidden /> Previous
                </span>
                <span className="text-[14px] font-medium text-[var(--om-text-1)]">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={docHref(next.slug)} className="flex flex-col items-end gap-[2px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[14px] text-right transition-colors hover:border-[var(--om-border-focus)]">
                <span className="flex items-center gap-[4px] text-[12px] text-[var(--om-text-3)]">
                  Next <ArrowRight size={12} aria-hidden />
                </span>
                <span className="text-[14px] font-medium text-[var(--om-text-1)]">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        </article>

        {toc.length > 1 ? (
          <aside aria-label="On this page" className="sticky top-[112px] hidden max-h-[calc(100dvh-136px)] w-[200px] shrink-0 self-start overflow-y-auto xl:block">
            <h2 className="pb-[8px] text-[12px] font-medium uppercase leading-[16px] tracking-[0.04em] text-[var(--om-text-3)]">On this page</h2>
            <ul className="flex flex-col gap-[6px] border-l border-[var(--om-border)]">
              {toc.map((heading) => (
                <li key={heading.id}>
                  <a href={`#${heading.id}`} className="-ml-px block border-l border-transparent pl-[12px] text-[13px] leading-[18px] text-[var(--om-text-2)] hover:border-[var(--om-text-1)] hover:text-[var(--om-text-1)]">
                    {heading.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
