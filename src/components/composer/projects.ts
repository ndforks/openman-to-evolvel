"use client";

/** Projects for the composer, read from the shared `/api/projects` list. */
import { useProjects as useServerProjects, type Project } from "@/components/shell/projects-store";
import { useComposerStore } from "./store";

export type { Project };

export function useProjects(): Project[] {
  return useServerProjects();
}

/** The project new tasks are filed under, or null when none is chosen (or the chosen one no longer exists). */
export function useSelectedProject(): Project | null {
  const projects = useProjects();
  const projectId = useComposerStore((s) => s.projectId);
  return projects.find((project) => project.id === projectId) ?? null;
}
