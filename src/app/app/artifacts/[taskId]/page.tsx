import { Suspense } from "react";
import type { Metadata } from "next";
import { ArtifactsPage } from "@/components/artifacts/artifacts-page";

export const metadata: Metadata = { title: "Artifacts" };

/** /app/artifacts/[taskId]: a task's slides, analysis, research or audio, and every file it delivered, full page. */
export default function Page({ params }: { params: Promise<{ taskId: string }> }) {
  return <Suspense fallback={null}>{params.then(({ taskId }) => <ArtifactsPage taskId={taskId} />)}</Suspense>;
}
