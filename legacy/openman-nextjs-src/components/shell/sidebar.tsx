// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Left navigation of the logged-in app: 300 px wide (drag the edge for 180 to 480 px),
 * a 48 px top bar, 36 px rows, and a 52 px icon rail when collapsed through `useUI().toggleSidebar`.
 */
import Link from "next/link";
import { Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { usePref } from "@/components/settings/prefs";
import { useSettingsEffects } from "@/components/settings/useAppEffects";
import { cn } from "@/components/ui/cn";
import {
  AgentsIcon,
  AutomationIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ComputerIcon,
  FolderIcon,
  LibraryIcon,
  ListTodoIcon,
  MoreIcon,
  NewProjectIcon,
  NewTaskIcon,
  PluginsIcon,
  PlusIcon,
  ProjectBoxIcon,
  SearchIcon,
  SidebarIcon,
  WebsiteIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useUI } from "@/lib/ui-store";
import { Logo } from "./logo";
import { ProjectDialogs, ProjectMenu } from "./project-menu";
import { projectHref, reorderProjects, useProjects, useProjectsStore, type Project } from "./projects-store";
import { SidebarGlyph, SidebarRowContent, sidebarRowClass } from "./sidebar-row";
import { TaskDialogs } from "./task-menu";
import { SharedTaskRows, SkeletonRows, TaskList, TaskRows, useMarkOpenTaskRead, useSharedTasks } from "./task-list";
import { useMoveLegacySidebarPrefs, usePinnedTasks, useTasksStore, useTasksSync } from "./tasks-store";
import { UpgradeCard } from "./upgrade-card";
import { UserRow } from "./user-row";

export const APP_HOME = "/app";

/** Widths: the default, the drag limits, the rail, and the drag distances that collapse and expand. */
export const SIDEBAR_WIDTH = 300;
export const SIDEBAR_RAIL_WIDTH = 52;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const COLLAPSE_BELOW = 100;
const EXPAND_AFTER = 20;
const WIDTH_PREF = "navbarWidth";

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
  /** Keyboard hint shown on hover. */
  shortcut?: string;
  /** Other paths that light this row up. */
  also?: string[];
}

/** Grouping: two rows on top, then "Workspace" and "Explore". */
const TOP_NAV: readonly NavItem[] = [
  { href: APP_HOME, label: "New task", icon: NewTaskIcon, shortcut: "⌘⇧O" },
  { href: "/app/library", label: "Library", icon: LibraryIcon },
];
const MY_NAV: readonly NavItem[] = [
  { href: "/app/plugins", label: "Plugins & Skills", icon: PluginsIcon, also: ["/app/skills"] },
  { href: "/app/automations", label: "Automations", icon: AutomationIcon },
  { href: "/app/computers", label: "Computers", icon: ComputerIcon, also: ["/app/computer-use"] },
  // The agent's conversations in chat apps (Telegram, Slack DMs) get their own entry here.
  { href: "/app/agents", label: "Agents", icon: AgentsIcon },
];
const EXPLORE_NAV: readonly NavItem[] = [{ href: "/app/websites", label: "Websites", icon: WebsiteIcon }];

const isWithin = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** 32 px square button of the top bar. */
const TOP_BUTTON =
  "flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]";

/** Keyboard shortcuts as bound in Settings > Shortcuts, plus the task-completion alerts from Settings > General. */
function useShellShortcuts(): void {
  useSettingsEffects();
}

/** Width of the expanded sidebar and the drag on its edge. Dragging far left collapses it; dragging the rail's edge right opens it. */
function useSidebarResize(collapsed: boolean, toggleSidebar: () => void) {
  const [stored, setStored] = usePref<number>(WIDTH_PREF, SIDEBAR_WIDTH);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const saved = typeof stored === "number" && stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX ? stored : SIDEBAR_WIDTH;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    let last = saved;
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragWidth(null);
    };
    const move = (moved: PointerEvent) => {
      const delta = moved.clientX - startX;
      if (collapsed) {
        if (delta < EXPAND_AFTER) return;
        stop();
        toggleSidebar();
        return;
      }
      if (saved + delta <= COLLAPSE_BELOW) {
        stop();
        toggleSidebar();
        return;
      }
      last = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, saved + delta));
      setDragWidth(last);
    };
    const up = () => {
      stop();
      if (!collapsed && last !== saved) setStored(last);
    };
    setDragWidth(collapsed ? SIDEBAR_RAIL_WIDTH : saved);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return { width: collapsed ? SIDEBAR_RAIL_WIDTH : (dragWidth ?? saved), dragging: dragWidth !== null, onPointerDown };
}

function NavRow({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const { href, label, icon, shortcut, also } = item;
  // "New task" is an action rather than a place, so it only lights up on hover.
  const active = href !== APP_HOME && (isWithin(pathname, href) || (also ?? []).some((a) => isWithin(pathname, a)));
  const row = (
    <Link href={href} aria-current={pathname === href ? "page" : undefined} className={sidebarRowClass({ active, collapsed })}>
      <SidebarRowContent
        icon={icon}
        label={label}
        collapsed={collapsed}
        trailing={shortcut ? <kbd className="ms-auto shrink-0 pe-[6px] font-sans text-[11px] text-[var(--om-text-3)] opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100">{shortcut}</kbd> : null}
      />
    </Link>
  );
  return collapsed ? (
    <Tooltip label={label} side="right">
      {row}
    </Tooltip>
  ) : (
    row
  );
}

/** Small button that shows in a section header while the header is hovered. */
function HeaderAction({ label, onClick, children, className }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn("flex cursor-pointer items-center justify-center text-[var(--om-icon-3)] outline-none hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]", className)}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * A titled, collapsible group. Clicking the header hides its rows and shows a chevron after the label
 * (`Workspace >`); the choice is remembered. The header sticks while its rows scroll.
 */
function Section({ id, label, actions, children }: { id: string; label: string; actions?: ReactNode; children: ReactNode }) {
  const [closed, setClosed] = usePref<boolean>(`sidebar.section.${id}.closed`, false);
  const open = closed !== true;
  const toggle = () => setClosed(open);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggle();
  };
  return (
    <section aria-label={label} className="relative flex flex-col gap-px bg-[var(--om-bg-sidebar)]">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="group/nav-section sticky top-0 z-[3] flex h-[36px] cursor-pointer select-none items-center justify-between gap-[12px] bg-[var(--om-bg-sidebar)] py-[2px] pe-[2px] ps-[10px] outline-none"
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[10px] opacity-0 group-hover/nav-section:bg-[var(--om-fill-subtle)] group-hover/nav-section:opacity-100 group-focus-visible/nav-section:bg-[var(--om-fill-subtle)] group-focus-visible/nav-section:opacity-100" />
        <span className="relative flex min-w-0 flex-1 items-center gap-[2px]">
          <h2 className="min-w-0 truncate text-[13px] font-medium leading-[18px] tracking-[-0.091px] text-[var(--om-text-3)]">{label}</h2>
          {open ? (
            <ChevronUpIcon size={14} className="shrink-0 rotate-180 text-[var(--om-text-3)] opacity-0 group-hover/nav-section:opacity-100" />
          ) : (
            <ChevronRightIcon size={14} className="shrink-0 text-[var(--om-text-3)]" />
          )}
        </span>
        {actions ? <span className="invisible relative flex items-center justify-center group-focus-within/nav-section:visible group-hover/nav-section:visible">{actions}</span> : null}
      </div>
      {open ? children : null}
    </section>
  );
}

/**
 * One project. Clicking it opens the project page and shows its tasks under it; clicking it again on its own page
 * folds them away. Hover shows "..." (rename, pin, delete); rows can be dragged to reorder.
 */
function ProjectRow({ project, pathname, onPicked, drag }: { project: Project; pathname: string; onPicked?: () => void; drag?: DragHandlers }) {
  const router = useRouter();
  const [openList, setOpenList] = usePref<string[]>("sidebar.openProjects", []);
  const expanded = Array.isArray(openList) && openList.includes(project.id);
  const tasks = useTasksStore((s) => s.tasks);
  const [menuOpen, setMenuOpen] = useState(false);
  const href = projectHref(project.id);
  const here = pathname === href;
  const setExpanded = (on: boolean) => setOpenList((prev) => (Array.isArray(prev) ? [...prev.filter((x) => x !== project.id), ...(on ? [project.id] : [])] : on ? [project.id] : []));

  const pick = () => {
    onPicked?.();
    if (here) setExpanded(!expanded);
    else {
      setExpanded(true);
      router.push(href);
    }
  };

  return (
    <li
      data-project-row={project.id}
      draggable={drag && !project.shared ? true : undefined}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onDragEnd}
      className={cn("group/project relative", drag?.over && "before:absolute before:inset-x-[8px] before:-top-px before:h-[2px] before:rounded-full before:bg-[var(--om-icon-accent)]")}
    >
      <button
        type="button"
        aria-expanded={expanded}
        title={project.shared ? `${project.name} (shared by ${project.sharedBy || "its owner"})` : project.memberCount ? `${project.name} (shared with ${project.memberCount})` : project.name}
        onClick={pick}
        className={cn(sidebarRowClass({ active: here }), "pe-[32px]", menuOpen && "bg-[var(--om-fill-subtle)]")}
      >
        <SidebarRowContent
          icon={ProjectBoxIcon}
          label={project.name}
          trailing={
            project.shared || project.memberCount ? (
              <span data-shared-marker aria-label="Shared" className="flex shrink-0 items-center text-[var(--om-icon-3)] group-hover/project:opacity-0">
                <Users size={14} strokeWidth={1.8} />
              </span>
            ) : null
          }
        />
      </button>
      <ProjectMenu project={project} onOpenChange={setMenuOpen}>
        <button
          type="button"
          aria-label={`Project options for ${project.name}`}
          className="absolute end-[6px] top-[6px] flex size-[24px] cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] opacity-0 outline-none transition-opacity hover:bg-[var(--om-fill)] focus-visible:opacity-100 group-hover/project:opacity-100 data-[state=open]:bg-[var(--om-fill-strong)] data-[state=open]:opacity-100"
        >
          <MoreIcon size={16} />
        </button>
      </ProjectMenu>
      {expanded ? (
        <div className="pt-px">
          <TaskRows tasks={tasks.filter((t) => t.projectId === project.id)} pathname={pathname} indent empty="No tasks yet" />
        </div>
      ) : null}
    </li>
  );
}

interface DragHandlers {
  over: boolean;
  onDragStart: (e: DragEvent<HTMLLIElement>) => void;
  onDragOver: (e: DragEvent<HTMLLIElement>) => void;
  onDrop: (e: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}

/** Drag to reorder within one group (pinned or not). The new order goes to `/api/projects/reorder`. */
function useProjectDrag(all: Project[]) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  return (project: Project): DragHandlers => ({
    over: overId === project.id && dragId !== null && dragId !== project.id,
    onDragStart: (e) => {
      setDragId(project.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", project.id);
    },
    onDragOver: (e) => {
      const from = all.find((p) => p.id === dragId);
      if (!from || from.pinned !== project.pinned) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overId !== project.id) setOverId(project.id);
    },
    onDrop: (e) => {
      e.preventDefault();
      const from = dragId;
      setDragId(null);
      setOverId(null);
      if (!from || from === project.id) return;
      const ids = all.map((p) => p.id).filter((id) => id !== from);
      ids.splice(ids.indexOf(project.id), 0, from);
      reorderProjects(ids).catch((err: unknown) => toast(err instanceof Error ? err.message : "Could not save the new order.", "error"));
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
  });
}

/** The user's unpinned projects, or the "New project" row while there are none. */
function ProjectRows({ pathname, onPicked }: { pathname: string; onPicked?: () => void }) {
  const open = useUI((s) => s.open);
  const projects = useProjects();
  const drag = useProjectDrag(projects);
  const unpinned = projects.filter((p) => !p.pinned);
  const status = useProjectsStore((s) => s.status);

  if (projects.length === 0 && status === "idle") return <SkeletonRows count={1} />;
  if (projects.length === 0) {
    return (
      <div className="flex w-full flex-col gap-px">
        <button
          type="button"
          onClick={() => {
            onPicked?.();
            open("create-project");
          }}
          className={cn(sidebarRowClass(), "pe-[8px]")}
        >
          <SidebarRowContent icon={NewProjectIcon} label="New project" />
        </button>
      </div>
    );
  }
  return (
    <ul className="flex w-full flex-col gap-px">
      {unpinned.map((project) => (
        <ProjectRow key={project.id} project={project} pathname={pathname} onPicked={onPicked} drag={drag(project)} />
      ))}
    </ul>
  );
}

/** "Pinned": pinned projects, then tasks pinned from their menu. Shown only when something is pinned. */
function PinnedRows({ pathname }: { pathname: string }) {
  const projects = useProjects();
  const drag = useProjectDrag(projects);
  const pinnedIds = usePinnedTasks();
  const tasks = useTasksStore((s) => s.tasks);
  const pinnedProjects = projects.filter((p) => p.pinned);
  const pinnedTasks = pinnedIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  return (
    <>
      {pinnedProjects.length ? (
        <ul className="flex w-full flex-col gap-px">
          {pinnedProjects.map((project) => (
            <ProjectRow key={project.id} project={project} pathname={pathname} drag={drag(project)} />
          ))}
        </ul>
      ) : null}
      <TaskRows tasks={pinnedTasks} pathname={pathname} />
    </>
  );
}

function useHasPinned(): boolean {
  const projects = useProjects();
  const pinnedIds = usePinnedTasks();
  const tasks = useTasksStore((s) => s.tasks);
  return projects.some((p) => p.pinned) || pinnedIds.some((id) => tasks.some((t) => t.id === id));
}

/** Rail button for a section: its rows open in a panel beside the rail. */
function RailSection({ label, icon: Icon, pathname, children }: { label: string; icon: IconComponent; pathname: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  // Following a row's link closes the panel.
  const openedAt = useRef(pathname);
  useEffect(() => {
    if (openedAt.current !== pathname) setOpen(false);
    openedAt.current = pathname;
  }, [pathname]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={cn(sidebarRowClass({ collapsed: true }), open && "bg-[var(--om-fill)]")}>
          <SidebarGlyph>
            <Icon size={18} className="text-[var(--om-icon-1)]" />
          </SidebarGlyph>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8} aria-label={label} className="flex max-h-[min(576px,calc(100vh-20px))] w-[300px] flex-col gap-px overflow-y-auto rounded-[12px] p-[4px]">
        <div className="sticky top-[-4px] z-[3] flex min-h-[36px] shrink-0 items-center justify-between bg-[var(--om-surface)] px-[8px]">
          <span className="min-w-0 truncate text-[14px] leading-[20px] text-[var(--om-text-3)]">{label}</span>
        </div>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const open = useUI((s) => s.open);
  const { width, dragging, onPointerDown } = useSidebarResize(collapsed, toggleSidebar);
  const tasksStatus = useTasksStore((s) => s.status);
  const hasPinned = useHasPinned();
  const sharedTasks = useSharedTasks(pathname);
  useTasksSync(pathname);
  useShellShortcuts();
  useMoveLegacySidebarPrefs();
  useMarkOpenTaskRead(pathname);

  return (
    <aside
      aria-label="Sidebar"
      style={{ width }}
      className={cn(
        "group/sidebar relative flex h-full shrink-0 flex-col bg-[var(--om-bg-sidebar)] text-[14px] leading-[20px] duration-200 after:pointer-events-none after:absolute after:inset-y-0 after:end-0 after:z-[1] after:w-px after:bg-[var(--om-border)]",
        dragging ? "transition-none" : "transition-[width,transform]",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-[48px] shrink-0 items-center justify-between px-[10px] py-[8px]">
          {collapsed ? (
            // The rail shows the mark; hovering the rail swaps it for the button that opens the sidebar.
            <Tooltip label="Open sidebar" shortcut="⌘." side="right">
              <button
                type="button"
                aria-label="Open sidebar"
                aria-expanded={false}
                onClick={toggleSidebar}
                className="relative mx-[2px] flex size-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none group-hover/sidebar:hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]"
              >
                <Logo wordmark={false} className="group-hover/sidebar:hidden" />
                <SidebarIcon size={18} className="hidden group-hover/sidebar:block" />
              </button>
            </Tooltip>
          ) : (
            <>
              <Link href={APP_HOME} className="flex shrink-0 items-center rounded-[8px] outline-none">
                <Logo />
              </Link>
              <Tooltip label="Search" shortcut="⌘K" side="bottom">
                <button type="button" aria-label="Search" onClick={() => open("search")} className={cn(TOP_BUTTON, "me-[4px] ms-auto")}>
                  <SearchIcon size={18} />
                </button>
              </Tooltip>
              <Tooltip label="Close sidebar" shortcut="⌘." side="bottom">
                <button type="button" aria-label="Close sidebar" aria-expanded onClick={toggleSidebar} className={TOP_BUTTON}>
                  <SidebarIcon size={18} />
                </button>
              </Tooltip>
            </>
          )}
        </div>

        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden p-[8px] pb-0">
          {collapsed ? (
            // The rail has no room for the top bar's search button, so search becomes its first row.
            <Tooltip label="Search" shortcut="⌘K" side="right">
              <button type="button" aria-label="Search" onClick={() => open("search")} className={sidebarRowClass({ collapsed: true })}>
                <SidebarGlyph>
                  <SearchIcon size={18} className="text-[var(--om-icon-1)]" />
                </SidebarGlyph>
              </button>
            </Tooltip>
          ) : null}
          {TOP_NAV.map((item) => (
            <NavRow key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
          <div className="relative -mx-[8px] flex min-h-0 flex-1 flex-col">
            <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-[8px] pb-[12px] [scrollbar-width:thin]", collapsed ? "gap-[2px]" : "gap-[12px]")}>
              {collapsed ? (
                <>
                  {[...MY_NAV, ...EXPLORE_NAV].map((item) => (
                    <NavRow key={item.href} item={item} pathname={pathname} collapsed />
                  ))}
                  <div className="shrink-0 py-[8px]">
                    <div className="mx-auto h-px w-[28px] bg-[var(--om-border)]" />
                  </div>
                  <RailSection label="Projects" icon={FolderIcon} pathname={pathname}>
                    {(close) => <ProjectRows pathname={pathname} onPicked={close} />}
                  </RailSection>
                  <RailSection label="Tasks" icon={ListTodoIcon} pathname={pathname}>
                    {() => <TaskList pathname={pathname} />}
                  </RailSection>
                </>
              ) : (
                <>
                  <Section id="my" label="Workspace">
                    <div className="flex flex-col gap-px">
                      {MY_NAV.map((item) => (
                        <NavRow key={item.href} item={item} pathname={pathname} collapsed={false} />
                      ))}
                    </div>
                  </Section>
                  <Section id="explore" label="Explore">
                    <div className="flex flex-col gap-px">
                      {EXPLORE_NAV.map((item) => (
                        <NavRow key={item.href} item={item} pathname={pathname} collapsed={false} />
                      ))}
                    </div>
                  </Section>
                  {hasPinned ? (
                    <Section id="pinned" label="Pinned">
                      <PinnedRows pathname={pathname} />
                    </Section>
                  ) : tasksStatus === "idle" ? (
                    <SkeletonRows count={1} />
                  ) : null}
                  <Section
                    id="projects"
                    label="Projects"
                    actions={
                      <HeaderAction label="Create project" onClick={() => open("create-project")} className="size-[28px] rounded-[6px]">
                        <PlusIcon size={18} />
                      </HeaderAction>
                    }
                  >
                    <ProjectRows pathname={pathname} />
                  </Section>
                  <Section
                    id="tasks"
                    label="Tasks"
                    actions={
                      <HeaderAction label="New task" onClick={() => router.push(APP_HOME)} className="size-[28px] rounded-[6px] hover:bg-[var(--om-fill-subtle)]">
                        <NewTaskIcon size={18} />
                      </HeaderAction>
                    }
                  >
                    <TaskList pathname={pathname} />
                  </Section>
                  {sharedTasks.length > 0 ? (
                    <Section id="shared" label="Shared with you">
                      <SharedTaskRows tasks={sharedTasks} pathname={pathname} />
                    </Section>
                  ) : null}
                </>
              )}
              <div className="h-[48px] shrink-0" />
            </div>
          </div>
        </nav>

        <div className="relative flex shrink-0 flex-col items-start justify-center gap-[8px] bg-[var(--om-bg-sidebar)] p-[8px]">
          {collapsed ? null : (
            <>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[-20px] h-[24px] bg-[var(--om-bg-sidebar)] [mask-image:linear-gradient(180deg,transparent_0%,#000_100%)]" />
              <UpgradeCard />
            </>
          )}
          <UserRow collapsed={collapsed} />
        </div>
      </div>

      <div onPointerDown={onPointerDown} className={cn("group/handle absolute bottom-0 end-[-4px] top-0 z-[2] w-[8px] touch-none", collapsed ? "cursor-e-resize" : "cursor-ew-resize")}>
        <div className={cn("h-full w-[4px] transition-colors group-hover/handle:bg-[var(--om-icon-accent)]", dragging && "bg-[var(--om-icon-accent)]")} />
      </div>
      <TaskDialogs />
      <ProjectDialogs />
    </aside>
  );
}

/** Static stand-in shown while the real sidebar waits for the URL during prerendering. */
export function SidebarFallback() {
  return (
    <div
      aria-hidden="true"
      style={{ width: SIDEBAR_WIDTH }}
      className="relative h-full shrink-0 bg-[var(--om-bg-sidebar)] after:pointer-events-none after:absolute after:inset-y-0 after:end-0 after:w-px after:bg-[var(--om-border)]"
    />
  );
}
