import { Suspense } from "react";
import type { Metadata } from "next";
import { ComputerDetailPage } from "@/components/pages/computers/ComputerDetailPage";

export const metadata: Metadata = { title: "Computer" };

/** /app/computers/[id]: one cloud computer. The id is known at request time only, so it is read inside Suspense. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}>{params.then(({ id }) => <ComputerDetailPage id={id} />)}</Suspense>;
}
