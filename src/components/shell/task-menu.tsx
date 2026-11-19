// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The task menu, opened from a sidebar row's "..." button, from a right-click on the row
 * (same items, opened at the pointer) and, in a shorter variant, from the task header's "..." button.
 * Row:    Share, Copy >, Open in new tab, Quote in new task | Rename, Pin, Add to favorites, Mark as unread | Move to project > | Archive, Delete
 * Header: Copy > | Rename, Pin, Add to favorites, Quote in new task | Move to project > | Archive, Delete
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Archive, Copy, ExternalLink, Forward as ForwardGlyph, FolderInput, Link2, MessageSquareDot, MessageSquareQuote, PencilLine, Pin, PinOff, RefreshCw, Star, Trash2, Type } from "lucide-react";
import { create } from "zustand";
import { stashPrompt } from "@/components/composer/handoff";
import { ModalShell } from "@/components/modals/ModalShell";
import { cn } from "@/components/ui/cn";
import { CheckIcon, NewProjectIcon, ProjectBoxIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { getTask, sendMessage } from "@/lib/agent/client";
import { useUI } from "@/lib/ui-store";
import { useProjects } from "./projects-store";
import { patchTask, removeTask, setPinned, setUnread, usePinnedTasks, useUnreadTasks } from "./tasks-store";

export interface MenuTask {
  id: string;
  title: string;
  favorite?: boolean;
  projectId?: string | null;
  archived?: boolean;
}

/** Fired after a prompt was stashed for Home while Home is already on screen. */
export const PROMPT_STASHED = "openman:prompt-stashed";

export const taskPath = (id: string) => `/app/task/${encodeURIComponent(id)}`;
export const taskUrl = (id: string) => (typeof window === "undefined" ? taskPath(id) : `${window.location.origin}${taskPath(id)}`);

/* ---------------------------------------------------------------- dialogs shared by every menu */

interface DialogState {
  renaming: MenuTask | null;
  deleting: MenuTask | null;
  /** Row currently being renamed in place (the sidebar shows an input instead of a dialog). */
  inlineId: string | null;
}
export const useTaskDialogs = create<DialogState>(() => ({ renaming: null, deleting: null, inlineId: null }));

/** Starts a rename: in place when the task's sidebar row is on screen, otherwise in a dialog. */
export function startRename(task: MenuTask, preferInline: boolean) {
  const row = preferInline && typeof document !== "undefined" ? document.querySelector(`[data-task-row="${CSS.escape(task.id)}"]`) : null;
  if (row && row.getBoundingClientRect().width > 120) useTaskDialogs.setState({ inlineId: task.id });
  else useTaskDialogs.setState({ renaming: task });
}

const DIALOG = "flex w-[400px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-[16px] border border-[var(--om-border)] bg-[var(--om-surface)] p-5 shadow-[0_12px_40px_var(--om-shadow-md)]";
const DIALOG_BUTTON = "flex h-9 cursor-pointer items-center justify-center rounded-[10px] px-4 text-[14px] font-medium leading-5 outline-none transition-[opacity,background-color] disabled:cursor-default disabled:opacity-50";
const DIALOG_CANCEL = cn(DIALOG_BUTTON, "border border-[var(--om-border-strong)] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]");

function RenameDialog({ task, onClose }: { task: MenuTask; onClose: () => void }) {
  const [value, setValue] = useState(task.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = value.trim();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!next || saving) return;
    if (next === task.title) return onClose();
    setSaving(true);
    try {
      await patchTask(task.id, { title: next });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be renamed.");
      setSaving(false);
    }
  };
  return (
    <ModalShell title="Rename task" onClose={onClose} closeButton={false} className={DIALOG}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <span className="text-[16px] font-semibold leading-6 text-[var(--om-text-1)]">Rename task</span>
        <input
          autoFocus
          value={value}
          maxLength={300}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-label="Task name"
          className="h-10 rounded-[10px] border border-[var(--om-border-strong)] bg-transparent px-3 text-[14px] leading-5 text-[var(--om-text-1)] outline-none transition-colors focus:border-[var(--om-border-focus)]"
        />
        {error ? <p role="alert" className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>Cancel</button>
          <button type="submit" disabled={!next || saving} className={cn(DIALOG_BUTTON, "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90")}>Save</button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteDialog({ task, onClose }: { task: MenuTask; onClose: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setDeleting(true);
    setError(null);
    const here = window.location.pathname === taskPath(task.id);
    try {
      await removeTask(task.id);
      onClose();
      toast("Task deleted", "success");
      if (here) router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be deleted.");
      setDeleting(false);
    }
  };
  return (
    <ModalShell title="Delete task" onClose={onClose} closeButton={false} className={DIALOG}>
      <div className="flex flex-col gap-2">
        <span className="text-[16px] font-semibold leading-6 text-[var(--om-text-1)]">Delete this task?</span>
        <span className="break-words text-[14px] leading-5 text-[var(--om-text-2)]">&ldquo;{task.title || "Untitled task"}&rdquo;, its conversation, files and share link will be removed. This cannot be undone.</span>
      </div>
      {error ? <p role="alert" className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={DIALOG_CANCEL}>Cancel</button>
        <button type="button" disabled={deleting} onClick={() => void confirm()} className={cn(DIALOG_BUTTON, "bg-[var(--om-danger)] text-white hover:opacity-90")}>Delete</button>
      </div>
    </ModalShell>
  );
}

/** Mount once (the sidebar does): the rename and delete dialogs every task menu opens. */
export function TaskDialogs() {
  const { renaming, deleting } = useTaskDialogs();
  return (
    <>
      {renaming ? <RenameDialog key={renaming.id} task={renaming} onClose={() => useTaskDialogs.setState({ renaming: null })} /> : null}
      {deleting ? <DeleteDialog key={deleting.id} task={deleting} onClose={() => useTaskDialogs.setState({ deleting: null })} /> : null}
    </>
  );
}

/* ---------------------------------------------------------------- actions */

const copy = (text: string, label: string) => {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast(label, "success"))
    .catch(() => toast("Copying is blocked in this browser", "error"));
};

/** The task's last answer as a quote, handed to the Home composer. */
async function quoteInNewTask(task: MenuTask, go: (href: string) => void) {
  let text = task.title;
  try {
    const { events } = await getTask(task.id);
    const last = [...events].reverse().find((e) => e.type === "message.completed");
    if (last && last.type === "message.completed" && last.text.trim()) text = last.text.trim();
  } catch {
    // Quote the title instead.
  }
  const quoted = text.split("\n").map((line) => `> ${line}`).join("\n");
  stashPrompt(`${quoted}\n\n`, "draft");
  // Home reads the stash when it mounts; when it is already open it listens for this event instead.
  if (window.location.pathname === "/app") window.dispatchEvent(new Event(PROMPT_STASHED));
  else go("/app");
}

async function run(action: () => Promise<unknown>, done?: string) {
  try {
    await action();
    if (done) toast(done, "success");
  } catch (err) {
    toast(err instanceof Error ? err.message : "That did not go through.", "error");
  }
}

/* ---------------------------------------------------------------- items */

const ITEM = "h-[42px] min-h-0 gap-[10px] rounded-[8px] px-[10px] py-0 text-[16px] leading-[22px]";
const ICON = "shrink-0 text-[var(--om-icon-1)]";
const SEP = "mx-[6px] my-[4px]";

function Item({ icon, children, onSelect, danger }: { icon: ReactNode; children: ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <MenuItem onSelect={onSelect} className={cn(ITEM, danger && "text-[var(--om-danger)] data-[highlighted]:text-[var(--om-danger)]")}>
      <span className={cn("flex size-[18px] items-center justify-center", danger ? "text-[var(--om-danger)]" : "text-[var(--om-icon-1)]")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuItem>
  );
}

function SubTrigger({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <MenuSubTrigger className={ITEM}>
      <span className="flex size-[18px] items-center justify-center text-[var(--om-icon-1)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuSubTrigger>
  );
}

const SUB = "w-[220px] p-[4px]";

export function TaskMenuItems({ task, variant }: { task: MenuTask; variant: "row" | "header" }) {
  const router = useRouter();
  const open = useUI((s) => s.open);
  const projects = useProjects();
  const pinned = usePinnedTasks().includes(task.id);
  const unread = useUnreadTasks().includes(task.id);
  const go = (href: string) => router.push(href);

  const moveTo = (projectId: string | null) => {
    const name = projectId ? projects.find((p) => p.id === projectId)?.name : null;
    void run(() => patchTask(task.id, { projectId }), name ? `Moved to ${name}` : "Removed from project");
  };

  const share = <Item icon={<Forward />} onSelect={() => open("share", { taskId: task.id, title: task.title, url: taskUrl(task.id) })}>Share</Item>;
  const copyMenu = (
    <MenuSub>
      <SubTrigger icon={<Copy size={18} strokeWidth={1.7} className={ICON} />}>Copy</SubTrigger>
      <MenuSubContent className={SUB} sideOffset={6}>
        <Item icon={<Link2 size={18} strokeWidth={1.7} />} onSelect={() => copy(taskUrl(task.id), "Link copied")}>Copy link</Item>
        <Item icon={<Type size={18} strokeWidth={1.7} />} onSelect={() => copy(task.title, "Title copied")}>Copy title</Item>
      </MenuSubContent>
    </MenuSub>
  );
  const openTab = <Item icon={<ExternalLink size={18} strokeWidth={1.7} />} onSelect={() => window.open(taskPath(task.id), "_blank", "noopener")}>Open in new tab</Item>;
  const quote = <Item icon={<MessageSquareQuote size={18} strokeWidth={1.7} />} onSelect={() => void quoteInNewTask(task, go)}>Quote in new task</Item>;
  const rename = <Item icon={<PencilLine size={18} strokeWidth={1.7} />} onSelect={() => startRename(task, variant === "row")}>Rename</Item>;
  const pin = (
    <Item icon={pinned ? <PinOff size={18} strokeWidth={1.7} /> : <Pin size={18} strokeWidth={1.7} />} onSelect={() => setPinned(task.id, !pinned)}>
      {pinned ? "Unpin" : "Pin"}
    </Item>
  );
  const favorite = (
    <Item icon={<Star size={18} strokeWidth={1.7} className={task.favorite ? "fill-current" : undefined} />} onSelect={() => void run(() => patchTask(task.id, { favorite: !task.favorite }))}>
      {task.favorite ? "Remove from favorites" : "Add to favorites"}
    </Item>
  );
  const markUnread = (
    <Item icon={<MessageSquareDot size={18} strokeWidth={1.7} />} onSelect={() => setUnread(task.id, !unread)}>
      {unread ? "Mark as read" : "Mark as unread"}
    </Item>
  );
  const move = (
    <MenuSub>
      <SubTrigger icon={<FolderInput size={18} strokeWidth={1.7} />}>Move to project</SubTrigger>
      <MenuSubContent className={cn(SUB, "max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto")} sideOffset={6}>
        {projects.map((p) => (
          <MenuItem key={p.id} onSelect={() => moveTo(p.id === task.projectId ? null : p.id)} className={ITEM}>
            <ProjectBoxIcon size={18} className="shrink-0 text-[var(--om-icon-1)]" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.id === task.projectId ? <CheckIcon size={16} className="shrink-0" /> : null}
          </MenuItem>
        ))}
        {task.projectId ? (
          <Item icon={<FolderInput size={18} strokeWidth={1.7} />} onSelect={() => moveTo(null)}>
            Remove from project
          </Item>
        ) : null}
        {projects.length > 0 || task.projectId ? <MenuSeparator className={SEP} /> : null}
        <Item icon={<NewProjectIcon size={18} />} onSelect={() => open("create-project", { onCreated: (p: { id: string }) => moveTo(p.id), stay: true })}>
          New project
        </Item>
      </MenuSubContent>
    </MenuSub>
  );
  // Self-updating projects: the agent reviews this conversation and proposes changes; a card asks before anything changes.
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const updateProjectItem =
    project && (!project.shared || project.role === "editor") ? (
      <Item
        icon={<RefreshCw size={18} strokeWidth={1.7} />}
        onSelect={() =>
          void run(
            () =>
              sendMessage(task.id, {
                mode: "queue",
                text: `Update the project "${project.name}" from this conversation: review what we learned and propose changes to its instructions, knowledge files or skills.`,
              }),
            "Asked the agent to propose project updates",
          )
        }
      >
        Update project from task
      </Item>
    ) : null;
  const archive = (
    <Item icon={<Archive size={18} strokeWidth={1.7} />} onSelect={() => void run(() => patchTask(task.id, { archived: !task.archived }), task.archived ? "Task restored" : "Task archived")}>
      {task.archived ? "Unarchive" : "Archive"}
    </Item>
  );
  const remove = (
    <Item danger icon={<Trash2 size={18} strokeWidth={1.7} />} onSelect={() => useTaskDialogs.setState({ deleting: task })}>
      Delete
    </Item>
  );

  if (variant === "header") {
    return (
      <>
        {copyMenu}
        <MenuSeparator className={SEP} />
        {rename}
        {pin}
        {favorite}
        {quote}
        <MenuSeparator className={SEP} />
        {move}
        {updateProjectItem}
        <MenuSeparator className={SEP} />
        {archive}
        {remove}
      </>
    );
  }
  return (
    <>
      {share}
      {copyMenu}
      {openTab}
      {quote}
      <MenuSeparator className={SEP} />
      {rename}
      {pin}
      {favorite}
      {markUnread}
      <MenuSeparator className={SEP} />
      {move}
      <MenuSeparator className={SEP} />
      {archive}
      {remove}
    </>
  );
}

/** The share arrow of the menus. */
function Forward() {
  return <ForwardGlyph size={18} strokeWidth={1.7} aria-hidden="true" />;
}

export const TASK_MENU_CONTENT = "w-[236px] p-[4px]";

/** "..." trigger plus menu. `children` is the trigger button. */
export function TaskMenu({ task, variant, children, align = "start", side = "bottom", onOpenChange }: { task: MenuTask; variant: "row" | "header"; children: ReactNode; align?: "start" | "end"; side?: "top" | "bottom"; onOpenChange?: (open: boolean) => void }) {
  return (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuContent align={align} side={side} sideOffset={4} className={TASK_MENU_CONTENT} onCloseAutoFocus={(e) => e.preventDefault()}>
        <TaskMenuItems task={task} variant={variant} />
      </MenuContent>
    </Menu>
  );
}

/** Right-click on `children` opens the row menu at the pointer. */
export function useTaskContextMenu(task: MenuTask) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const onContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    setAt({ x: event.clientX, y: event.clientY });
  };
  const menu = (
    <Menu open={at !== null} onOpenChange={(next) => (next ? undefined : setAt(null))}>
      <MenuTrigger asChild>
        <span aria-hidden="true" tabIndex={-1} style={{ position: "fixed", left: at?.x ?? 0, top: at?.y ?? 0, width: 0, height: 0, pointerEvents: "none" }} />
      </MenuTrigger>
      <MenuContent align="start" side="bottom" sideOffset={2} className={TASK_MENU_CONTENT} onCloseAutoFocus={(e) => e.preventDefault()}>
        <TaskMenuItems task={task} variant="row" />
      </MenuContent>
    </Menu>
  );
  return { onContextMenu, menu, open: at !== null };
}
