// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { Suspense } from "react";
import type { Metadata } from "next";
import { DocPageView, docMetadata, visiblePages } from "../_components/doc-page";

/** Every docs page is known at build time, so each one is prerendered in full. */
export function generateStaticParams() {
  return visiblePages()
    .filter((page) => page.slug)
    .map((page) => ({ slug: page.slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[...slug]">): Promise<Metadata> {
  const { slug } = await params;
  return docMetadata(slug.join("/"));
}

/** Reads the slug inside the Suspense boundary, as cacheComponents requires. */
async function DocBody({ params }: { params: PageProps<"/docs/[...slug]">["params"] }) {
  const { slug } = await params;
  return <DocPageView slug={slug.join("/")} />;
}

/**
 * `/docs/<slug>` and `/docs/<section>/<slug>`: one page from `content/docs/`. An unknown docs URL never reaches
 * this page: `src/proxy.ts` answers it with the not-found page and a real 404 status (a streamed page cannot).
 */
export default function DocPage({ params }: PageProps<"/docs/[...slug]">) {
  return (
    <Suspense fallback={<main className="w-full flex-1 bg-[var(--om-bg)]" />}>
      <DocBody params={params} />
    </Suspense>
  );
}
