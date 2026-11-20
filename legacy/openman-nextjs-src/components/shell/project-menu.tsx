// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** The "..." menu of a project (sidebar row, project page header) and its rename and delete dialogs. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { LogOut, PencilLine, Pin, PinOff, Trash2 } from "lucide-react";
import { create } from "zustand";
import { ModalShell } from "@/components/modals/ModalShell";
import { cn } from "@/components/ui/cn";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { useComposerStore } from "@/components/composer/store";
import { deleteProject, leaveProject, projectHref, updateProject, type Project } from "./projects-store";
import { refreshTasks } from "./tasks-store";

interface State {
  renaming: Project | null;
  deleting: Project | null;
}
export const useProjectDialogs = create<State>(() => ({ renaming: null, deleting: null }));

const DIALOG = "flex w-[400px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-[16px] border border-[var(--om-border)] bg-[var(--om-surface)] p-5 shadow-[0_12px_40px_var(--om-shadow-md)]";
const BUTTON = "flex h-9 cursor-pointer items-center justify-center rounded-[10px] px-4 text-[14px] font-medium leading-5 outline-none transition-[opacity,background-color] disabled:cursor-default disabled:opacity-50";
const CANCEL = cn(BUTTON, "border border-[var(--om-border-strong)] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)]");

function RenameProject({ project, onClose }: { project: Project; onClose: () => void }) {
  const [value, setValue] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const next = value.trim();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!next || saving) return;
    if (next === project.name) return onClose();
    setSaving(true);
    try {
      await updateProject(project.id, { name: next });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be renamed.");
      setSaving(false);
    }
  };
  return (
    <ModalShell title="Rename project" onClose={onClose} closeButton={false} className={DIALOG}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <span className="text-[16px] font-semibold leading-6">Rename project</span>
        <input autoFocus aria-label="Project name" value={value} maxLength={200} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} className="h-10 rounded-[10px] border border-[var(--om-border-strong)] bg-transparent px-3 text-[14px] leading-5 text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]" />
        {error ? <p role="alert" className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={CANCEL}>Cancel</button>
          <button type="submit" disabled={!next || saving} className={cn(BUTTON, "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90")}>Save</button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteProject({ project, onClose }: { project: Project; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    const here = window.location.pathname === projectHref(project.id);
    try {
      await deleteProject(project.id);
      if (useComposerStore.getState().projectId === project.id) useComposerStore.getState().setProjectId(null);
      void refreshTasks();
      onClose();
      toast(`Project “${project.name}” deleted`, "success");
      if (here) router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be deleted.");
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Delete project" onClose={onClose} closeButton={false} className={DIALOG}>
      <div className="flex flex-col gap-2">
        <span className="text-[16px] font-semibold leading-6">Delete this project?</span>
        <span className="break-words text-[14px] leading-5 text-[var(--om-text-2)]">&ldquo;{project.name}&rdquo; and its instructions and files will be removed. Its tasks stay, outside any project.</span>
      </div>
      {error ? <p role="alert" className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={CANCEL}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => void confirm()} className={cn(BUTTON, "bg-[var(--om-danger)] text-white hover:opacity-90")}>Delete</button>
      </div>
    </ModalShell>
  );
}

export function ProjectDialogs() {
  const { renaming, deleting } = useProjectDialogs();
  return (
    <>
      {renaming ? <RenameProject key={renaming.id} project={renaming} onClose={() => useProjectDialogs.setState({ renaming: null })} /> : null}
      {deleting ? <DeleteProject key={deleting.id} project={deleting} onClose={() => useProjectDialogs.setState({ deleting: null })} /> : null}
    </>
  );
}

const ITEM = "h-[42px] min-h-0 gap-[10px] rounded-[8px] px-[10px] py-0 text-[16px] leading-[22px]";

export function ProjectMenuItems({ project }: { project: Project }) {
  const router = useRouter();
  if (project.shared) {
    // Someone else's project: only leaving is the caller's to do.
    const leave = () => {
      if (!window.confirm(`Leave “${project.name}”? Your tasks in it stay yours.`)) return;
      leaveProject(project.id)
        .then(() => {
          toast(`You left “${project.name}”`, "success");
          if (window.location.pathname === projectHref(project.id)) router.push("/app");
        })
        .catch((err: unknown) => toast(err instanceof Error ? err.message : "You could not leave the project.", "error"));
    };
    return (
      <MenuItem className={cn(ITEM, "text-[var(--om-danger)] data-[highlighted]:text-[var(--om-danger)]")} onSelect={leave}>
        <LogOut size={18} strokeWidth={1.7} className="shrink-0" />
        Leave project
      </MenuItem>
    );
  }
  const togglePin = () => updateProject(project.id, { pinned: !project.pinned }).catch((err: unknown) => toast(err instanceof Error ? err.message : "That did not go through.", "error"));
  return (
    <>
      <MenuItem className={ITEM} onSelect={() => useProjectDialogs.setState({ renaming: project })}>
        <PencilLine size={18} strokeWidth={1.7} className="shrink-0" />
        Rename
      </MenuItem>
      <MenuItem className={ITEM} onSelect={() => void togglePin()}>
        {project.pinned ? <PinOff size={18} strokeWidth={1.7} className="shrink-0" /> : <Pin size={18} strokeWidth={1.7} className="shrink-0" />}
        {project.pinned ? "Unpin" : "Pin"}
      </MenuItem>
      <MenuSeparator className="mx-[6px] my-[4px]" />
      <MenuItem className={cn(ITEM, "text-[var(--om-danger)] data-[highlighted]:text-[var(--om-danger)]")} onSelect={() => useProjectDialogs.setState({ deleting: project })}>
        <Trash2 size={18} strokeWidth={1.7} className="shrink-0" />
        Delete
      </MenuItem>
    </>
  );
}

export function ProjectMenu({ project, children, align = "start", onOpenChange }: { project: Project; children: ReactNode; align?: "start" | "end"; onOpenChange?: (open: boolean) => void }) {
  return (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuContent align={align} sideOffset={4} className="w-[220px] p-[4px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <ProjectMenuItems project={project} />
      </MenuContent>
    </Menu>
  );
}
