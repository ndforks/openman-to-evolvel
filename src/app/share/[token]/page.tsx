import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { loadShared } from "./shared";
import { SharedView } from "./shared-view";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ replay?: string }> };

export const metadata: Metadata = { title: `Shared task | ${brand.name}`, robots: { index: false, follow: false } };

async function Shared({ params, searchParams }: Props) {
  const [{ token }, { replay }] = await Promise.all([params, searchParams]);
  const shared = await loadShared(token).catch((err) => {
    console.error("[share] could not load:", err instanceof Error ? err.message : err);
    return null;
  });
  if (!shared) notFound();
  return (
    <SharedView
      token={shared.token}
      title={shared.title}
      createdAt={shared.createdAt}
      items={shared.items}
      replay={replay === "1" || replay === "true"}
      brandName={brand.name}
      logoMark={brand.logoMark.replace(/\.svg$/, "-light.svg")}
    />
  );
}

/**
 * GET /share/[token]: read-only public view of a shared task, built from its stored events with
 * credentials redacted. `?replay=1` plays the events back in order. The token is only known at
 * request time, so the page sits inside Suspense (required with Cache Components).
 */
export default function SharePage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--om-bg)]" />}>
      <Shared {...props} />
    </Suspense>
  );
}
