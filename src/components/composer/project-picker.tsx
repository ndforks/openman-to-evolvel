"use client";

/** "Choose project" chip above the input: lists the user's projects and files new tasks under the chosen one. */
import { CheckIcon, NewProjectIcon, ProjectBoxIcon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { PICKER_SURFACE } from "@/components/ui/theme";
import { useUI } from "@/lib/ui-store";
import { useProjects, useSelectedProject } from "./projects";
import { useComposerStore } from "./store";
import { CONTEXT_CHIP } from "./target-picker";

export function ProjectPicker() {
  const open = useUI((s) => s.open);
  const projects = useProjects();
  const selected = useSelectedProject();
  const setProjectId = useComposerStore((s) => s.setProjectId);

  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label={selected ? `Project: ${selected.name}` : "Choose project"} className={CONTEXT_CHIP}>
          <span className="relative flex size-[16px] shrink-0 items-center justify-center">
            <ProjectBoxIcon size={16} strokeWidth={2} className="text-[var(--om-icon-2)]" />
          </span>
          <span className="max-w-[160px] truncate">{selected ? selected.name : "Choose project"}</span>
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" sideOffset={4} className={cn("w-[280px]", PICKER_SURFACE)}>
        <div className="max-h-[calc(var(--radix-dropdown-menu-content-available-height)-160px)] overflow-auto">
          {projects.length === 0 ? (
            <MenuLabel className="px-[8px] py-[12px] text-[14px] leading-[20px] text-[var(--om-text-disabled)]">You have no projects</MenuLabel>
          ) : (
            projects.map((project) => (
              <MenuItem key={project.id} onSelect={() => setProjectId(project.id === selected?.id ? null : project.id)}>
                <span className="flex size-[20px] shrink-0 items-center justify-center">
                  <ProjectBoxIcon size={18} strokeWidth={2} className="text-[var(--om-icon-1)]" />
                </span>
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.id === selected?.id ? (
                  <span className="flex size-[20px] shrink-0 items-center justify-center self-center">
                    <CheckIcon size={16} />
                  </span>
                ) : null}
              </MenuItem>
            ))
          )}
        </div>
        <div className="mt-[4px] border-t border-[var(--om-border)] pt-[4px]">
          <MenuItem onSelect={() => open("create-project")}>
            <span className="flex size-[20px] shrink-0 items-center justify-center">
              <NewProjectIcon size={16} />
            </span>
            New project
          </MenuItem>
        </div>
      </MenuContent>
    </Menu>
  );
}
