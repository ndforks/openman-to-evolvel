import { Suspense } from "react";
import type { Metadata } from "next";
import { SitePreviewPage } from "@/components/pages/websites/SitePreviewPage";

export const metadata: Metadata = { title: "Website preview" };

/** /app/website/[id]/preview: the site's live preview with its full toolbar, on its own page. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}>{params.then(({ id }) => <SitePreviewPage siteId={id} />)}</Suspense>;
}
