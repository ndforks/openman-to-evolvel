import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteDashboard } from "@/components/pages/websites/SiteDashboard";

export const metadata: Metadata = { title: "Website" };

/** /app/website/[id]: one site's dashboard (overview, versions, settings). */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}>{params.then(({ id }) => <SiteDashboard siteId={id} />)}</Suspense>;
}
