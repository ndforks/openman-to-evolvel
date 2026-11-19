"use client";

/**
 * Task rows of the sidebar ("Pinned", a project's tasks, "Tasks"), and how they behave:
 * hover fill and a 24 px "..." button at the row's end; the same menu on right-click, at the pointer;
 * a card with the full title and time after half a second of hover; a long title that scrolls into view
 * while the pointer rests on it; rename in place.
 */
import * as RadixTooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/components/ui/cn";
import { MoreIcon } from "@/components/ui/icons";
import { usePortalThemeClass } from "@/components/ui/theme";
import { toast } from "@/components/ui/toast";
import type { TaskStatus } from "@/lib/agent/types";
import { sidebarRowClass } from "./sidebar-row";
import { TaskMenu, taskPath, useTaskContextMenu, useTaskDialogs } from "./task-menu";
import { patchTask, setUnread, usePinnedTasks, useTasksStore, useUnreadTasks, type SidebarTask } from "./tasks-store";

export const taskHref = taskPath;

/** "Today, 3:10 PM", "Yesterday, 8:46 PM", "Nov 12, 8:46 PM". */
export function taskTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const time = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (t.getTime() >= start.getTime()) return `Today, ${time}`;
  if (t.getTime() >= start.getTime() - day) return `Yesterday, ${time}`;
  const sameYear = t.getFullYear() === start.getFullYear();
  return `${t.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}, ${time}`;
}

function StatusMark({ status, unread, queued = false }: { status: TaskStatus; unread: boolean; queued?: boolean }) {
  if (queued && status === "waking") {
    // Waiting for a free run slot (the limit on tasks at once); starts by itself.
    return (
      <span aria-label="Queued" title="Queued: starts automatically" className="shrink-0 rounded-[4px] bg-[var(--om-fill)] px-[4px] text-[11px] font-medium leading-[16px] text-[var(--om-text-3)]">
        Queued
      </span>
    );
  }
  if (status === "running" || status === "waking") {
    return <span aria-label="Running" className="block size-[14px] shrink-0 animate-spin rounded-full border-2 border-[var(--om-fill-strong)] border-t-[var(--om-icon-accent)]" />;
  }
  if (status === "waiting") return <span aria-label="Needs your input" className="size-[6px] shrink-0 rounded-full bg-[var(--om-warning)]" />;
  if (unread) return <span aria-label="Unread" className="size-[6px] shrink-0 rounded-full bg-[var(--om-icon-accent)]" />;
  return null;
}

function InlineRename({ task }: { task: SidebarTask }) {
  const [value, setValue] = useState(task.title);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    useTaskDialogs.setState({ inlineId: null });
    const next = value.trim();
    if (!save || !next || next === task.title) return;
    patchTask(task.id, { title: next }).catch((err: unknown) => toast(err instanceof Error ? err.message : "The task could not be renamed.", "error"));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  };
  return (
    <div className={cn(sidebarRowClass({ active: true }), "ps-[6px]")}>
      <input
        autoFocus
        aria-label="Task name"
        value={value}
        maxLength={300}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        className="h-[28px] min-w-0 flex-1 rounded-[6px] border border-[var(--om-border-focus)] bg-[var(--om-bg)] px-[6px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none"
      />
    </div>
  );
}

/** Scrolls a long title to its end while the pointer rests on the row (after `delay` ms). */
function useMarquee(active: boolean) {
  const box = useRef<HTMLSpanElement>(null);
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      const el = box.current;
      if (!el) return;
      const overflow = el.scrollWidth - el.clientWidth;
      setMeasured(overflow > 4 ? overflow + 28 : 0);
    }, 900);
    return () => {
      window.clearTimeout(timer);
      setMeasured(0);
    };
  }, [active]);
  return { box, shift: active ? measured : 0 };
}

export function TaskRow({ task, active, indent = false }: { task: SidebarTask; active: boolean; indent?: boolean }) {
  const theme = usePortalThemeClass();
  const inlineId = useTaskDialogs((s) => s.inlineId);
  const unread = useUnreadTasks().includes(task.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [tip, setTip] = useState(false);
  const context = useTaskContextMenu(task);
  const busy = menuOpen || context.open;
  const { box, shift } = useMarquee(hover && !busy);

  if (inlineId === task.id) {
    return (
      <li data-task-row={task.id}>
        <InlineRename task={task} />
      </li>
    );
  }

  const title = task.title || "New task";
  return (
    <li data-task-row={task.id} className="group/task relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onContextMenu={context.onContextMenu}>
      <RadixTooltip.Root delayDuration={500} open={tip && !busy} onOpenChange={setTip}>
        <RadixTooltip.Trigger asChild>
          <Link
            href={taskHref(task.id)}
            aria-current={active ? "page" : undefined}
            className={cn(sidebarRowClass({ active }), "pe-[30px]", indent ? "ps-[38px]" : "ps-[10px]", (busy || context.open) && "bg-[var(--om-fill-subtle)]")}
          >
            <span ref={box} className={cn("min-w-0 flex-1 overflow-hidden whitespace-nowrap", shift === 0 && "[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent_calc(100%-4px))]")}>
              <span
                className="inline-block will-change-transform"
                style={{ transform: `translateX(${-shift}px)`, transition: shift ? `transform ${Math.max(1.2, shift / 40)}s linear` : "transform 0.2s ease-out" }}
              >
                {title}
              </span>
            </span>
            <span className="absolute end-[10px] top-1/2 flex -translate-y-1/2 items-center group-hover/task:invisible group-focus-within/task:invisible">
              <StatusMark queued={Boolean((task as { queued?: boolean }).queued)} status={task.status} unread={unread} />
            </span>
          </Link>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side="right"
            align="start"
            sideOffset={14}
            alignOffset={-6}
            collisionPadding={8}
            className={cn(theme, "z-[60] flex w-[370px] max-w-[calc(100vw-320px)] items-start gap-[16px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[16px] py-[12px] font-sans shadow-[0_8px_24px_var(--om-shadow-sm)]")}
          >
            <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-[20px] text-[var(--om-text-1)]">{title}</span>
            <span className="shrink-0 whitespace-nowrap pt-[1px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{taskTime(task.updatedAt)}</span>
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
      <TaskMenu task={task} variant="row" side="top" onOpenChange={setMenuOpen}>
        <button
          type="button"
          aria-label={`Task options for ${title}`}
          className={cn(
            "absolute end-[6px] top-1/2 flex size-[24px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] opacity-0 outline-none transition-opacity hover:bg-[var(--om-fill)] focus-visible:opacity-100 group-hover/task:opacity-100 data-[state=open]:bg-[var(--om-fill-strong)] data-[state=open]:opacity-100",
            context.open && "opacity-100",
          )}
        >
          <MoreIcon size={16} />
        </button>
      </TaskMenu>
      {context.menu}
    </li>
  );
}

export function TaskRows({ tasks, pathname, indent = false, empty }: { tasks: SidebarTask[]; pathname: string; indent?: boolean; empty?: string }) {
  if (tasks.length === 0) return empty ? <p className={cn("flex h-[36px] items-center text-[14px] leading-[20px] text-[var(--om-text-3)]", indent ? "ps-[38px]" : "ps-[10px]")}>{empty}</p> : null;
  return (
    <ul className="flex flex-col gap-px">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} indent={indent} active={pathname === taskHref(task.id)} />
      ))}
    </ul>
  );
}

/** Clears "unread" for the task that is open. */
export function useMarkOpenTaskRead(pathname: string) {
  const unread = useUnreadTasks();
  useEffect(() => {
    const id = unread.find((u) => pathname === taskHref(u));
    if (id) setUnread(id, false);
  }, [pathname, unread]);
}

/** The "Tasks" section: every task not pinned and not filed under a project. */
export function TaskList({ pathname }: { pathname: string }) {
  const tasks = useTasksStore((s) => s.tasks);
  const status = useTasksStore((s) => s.status);
  const pinned = usePinnedTasks();
  if (status === "idle" && tasks.length === 0) return <SkeletonRows count={3} />;
  const shown = tasks.filter((t) => !pinned.includes(t.id) && !t.projectId);
  return <TaskRows tasks={shown} pathname={pathname} empty="No tasks yet" />;
}

/** Grey bars shown while the first list loads. */
export function SkeletonRows({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-px">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-[36px] items-center px-[10px]">
          <div className="h-[24px] w-full animate-pulse rounded-[6px] bg-[var(--om-fill)]" />
        </div>
      ))}
    </div>
  );
}

interface SharedTaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: string;
  invitedBy: string;
}

/** Tasks other people invited this account to (`GET /api/tasks/shared`). Refreshed on navigation and every minute. */
export function useSharedTasks(pathname: string): SharedTaskRow[] {
  const [tasks, setTasks] = useState<SharedTaskRow[]>([]);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/tasks/shared", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ tasks: SharedTaskRow[] }>) : { tasks: [] }))
        .then((b) => live && setTasks(b.tasks ?? []))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pathname]);
  return tasks;
}

/** Rows of the "Shared with you" section: open the task, with who shared it in the tooltip. No owner actions. */
export function SharedTaskRows({ tasks, pathname }: { tasks: SharedTaskRow[]; pathname: string }) {
  return (
    <ul className="flex flex-col gap-px" data-shared-tasks>
      {tasks.map((task) => {
        const active = pathname === taskHref(task.id);
        return (
          <li key={task.id} data-task-row={task.id}>
            <Link href={taskHref(task.id)} aria-current={active ? "page" : undefined} title={`${task.title || "Task"} (shared by ${task.invitedBy})`} className={cn(sidebarRowClass({ active }), "pe-[30px] ps-[10px] relative")}>
              <span className="min-w-0 flex-1 truncate">{task.title || "Task"}</span>
              <span className="absolute end-[10px] top-1/2 flex -translate-y-1/2 items-center">
                <StatusMark queued={Boolean((task as { queued?: boolean }).queued)} status={task.status} unread={false} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
