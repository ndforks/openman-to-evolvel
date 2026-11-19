import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectView, ProjectViewFallback } from "@/components/shell/project/project-view";

export const metadata: Metadata = { title: "Project" };

/**
 * /app/project/[id]: a project's page (instructions, files, its tasks and a composer bound to it).
 * The id is only known at request time, so the part that reads it sits inside Suspense (Cache Components).
 */
export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ProjectViewFallback />}>
      {params.then(({ id }) => (
        <ProjectView projectId={id} />
      ))}
    </Suspense>
  );
}
