// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Body of `/terms` and `/privacy`: the Markdown from `content/legal/`, in the docs typography. */
import { notFound } from "next/navigation";
import { loadLegal } from "@/app/docs/_lib/content";
import { DocMarkdown } from "@/app/docs/_components/markdown";

export function LegalPage({ name, title }: { name: "terms" | "privacy"; title: string }) {
  const markdown = loadLegal(name);
  if (!markdown) notFound();
  return (
    <main className="w-full flex-1 bg-[var(--om-bg)] px-6 pb-[96px] pt-[64px] text-[var(--om-text-1)] max-md:px-4 max-md:pt-[40px]">
      <article className="mx-auto w-full max-w-[720px]">
        <h1 className="font-serif text-[32px] leading-[40px] tracking-[-0.01em] md:text-[40px] md:leading-[48px]">{title}</h1>
        <div className="mt-[8px]">
          <DocMarkdown markdown={markdown} />
        </div>
      </article>
    </main>
  );
}
