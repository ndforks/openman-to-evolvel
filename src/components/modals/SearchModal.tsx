"use client";

/**
 * Search tasks (sidebar magnifier, ⌘K): a 690 x 440 panel, rows grouped by day
 * with the task's time on the right ("Yesterday, 8:46 PM"). Lists the user's tasks from `/api/tasks?archived=all`
 * (archived ones too, marked) and filters as you type.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MessageCircle, Search, SquareDashed, SquarePen, X } from "lucide-react";
import { taskTime } from "@/components/shell/task-list";
import type { TaskSummary } from "@/lib/agent/types";
import { useUI } from "@/lib/ui-store";
import { ModalShell, cn } from "./ModalShell";

const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"] as const;
const DAY_MS = 86_400_000;
const LIST_ID = "search-tasks-list";

function timeOf(task: TaskSummary): number {
  const t = Date.parse(task.updatedAt);
  return Number.isNaN(t) ? 0 : t;
}

function groupOf(time: number, startOfToday: number): number {
  if (time >= startOfToday) return 0;
  if (time >= startOfToday - DAY_MS) return 1;
  if (time >= startOfToday - 7 * DAY_MS) return 2;
  if (time >= startOfToday - 30 * DAY_MS) return 3;
  return 4;
}

function whenLabel(time: number): string {
  return time === 0 ? "" : taskTime(new Date(time).toISOString());
}

function RowIcon({ running, children }: { running?: boolean; children: ReactNode }) {
  return (
    <span className="relative flex size-[28px] shrink-0 items-center justify-center rounded-full bg-[var(--om-fill)] text-[var(--om-icon-2)]">
      {children}
      {running ? <span className="absolute -right-[1px] -top-[1px] size-[8px] rounded-full border-2 border-[var(--om-surface)] bg-[var(--om-btn-accent)]" /> : null}
    </span>
  );
}

export function SearchModal() {
  const router = useRouter();
  const close = useUI((s) => s.close);
  const [tasks, setTasks] = useState<(TaskSummary & { archived?: boolean })[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [startOfToday] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    // The route may be missing or failing; either way the modal falls back to its empty state.
    Promise.resolve()
      .then(() => fetch("/api/tasks?archived=all", { cache: "no-store" }))
      .then((r) => (r.ok ? (r.json() as Promise<{ tasks: (TaskSummary & { archived?: boolean })[] }>) : { tasks: [] }))
      .then((res) => {
        if (alive) setTasks(Array.isArray(res?.tasks) ? res.tasks : []);
      })
      .catch(() => {
        if (alive) setTasks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sorted = useMemo(() => [...(tasks ?? [])].sort((a, b) => timeOf(b) - timeOf(a)), [tasks]);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => (needle ? sorted.filter((task) => (task.title ?? "").toLowerCase().includes(needle)) : sorted), [sorted, needle]);
  // Each row carries its date group; a heading is shown where the group changes.
  const rows = matches.map((task, i) => {
    const time = timeOf(task);
    const group = groupOf(time, startOfToday);
    const previous = i > 0 ? groupOf(timeOf(matches[i - 1]), startOfToday) : -1;
    return { task, time, group, heading: group !== previous ? GROUPS[group] : null };
  });

  const loaded = tasks !== null;
  const hasTasks = sorted.length > 0;
  // Row 0 is "New task" whenever there is a list to show; the bare empty state has no rows.
  const showRows = loaded && (hasTasks || needle !== "");
  const total = showRows ? matches.length + 1 : 0;
  const activeIndex = total === 0 ? -1 : Math.min(active, total - 1);

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const openIndex = (index: number) => {
    if (index <= 0) go("/app");
    else go(`/app/task/${encodeURIComponent(matches[index - 1].id)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (total > 0) setActive(Math.min(activeIndex + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (total > 0) setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (loaded) openIndex(activeIndex);
    }
  };

  const rowClass = (index: number) =>
    cn(
      "flex h-[52px] w-full cursor-pointer items-center gap-[12px] rounded-[10px] px-[10px] text-left outline-none",
      index === activeIndex && "bg-[var(--om-fill)]",
    );

  return (
    <ModalShell
      title="Search tasks"
      closeButton={false}
      className="flex h-[440px] max-h-[calc(100vh-32px)] w-[690px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[16px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] text-[12px] leading-[16px] shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
    >
      <div className="flex h-[58px] shrink-0 items-center gap-[12px] border-b border-[var(--om-border)] px-[18px]">
        <Search size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--om-icon-2)]" />
        <input
          autoFocus
          role="combobox"
          aria-expanded={showRows}
          aria-controls={LIST_ID}
          aria-activedescendant={activeIndex >= 0 ? `${LIST_ID}-${activeIndex}` : undefined}
          aria-label="Search tasks"
          autoComplete="off"
          spellCheck={false}
          placeholder="Find a task by title"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(e.target.value.trim() === "" ? 0 : 1);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 basis-0 bg-transparent text-[15px] leading-[22px] text-[var(--om-text-1)] caret-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="-m-[5px] flex shrink-0 cursor-pointer items-center justify-center rounded-[6px] p-[5px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]"
        >
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {showRows ? (
        <div ref={listRef} id={LIST_ID} role="listbox" aria-label="Tasks" className="min-h-0 flex-1 basis-0 overflow-y-auto p-[8px] [scrollbar-width:thin]">
          <div id={`${LIST_ID}-0`} role="option" aria-selected={activeIndex === 0} data-index={0} onMouseMove={() => setActive(0)} onClick={() => openIndex(0)} className={rowClass(0)}>
            <RowIcon>
              <SquarePen size={15} strokeWidth={1.8} aria-hidden="true" />
            </RowIcon>
            <span className="min-w-0 flex-1 truncate text-[14px] leading-[20px] text-[var(--om-text-1)]">New task</span>
          </div>

          {rows.map(({ task, time, heading }, i) => {
            const index = i + 1;
            return (
              <div key={task.id} role="presentation">
                {heading ? <div className="px-[10px] pb-[4px] pt-[10px] text-[12px] leading-[16px] text-[var(--om-text-3)]">{heading}</div> : null}
                <div id={`${LIST_ID}-${index}`} role="option" aria-selected={activeIndex === index} data-index={index} onMouseMove={() => setActive(index)} onClick={() => openIndex(index)} className={rowClass(index)}>
                  <RowIcon running={task.status === "running" || task.status === "waking"}>
                    <MessageCircle size={15} strokeWidth={1.8} aria-hidden="true" />
                  </RowIcon>
                  <span className="min-w-0 flex-1 truncate text-[14px] leading-[20px] text-[var(--om-text-1)]">{task.title || "Untitled task"}</span>
                  {task.archived ? <span className="shrink-0 rounded-[6px] bg-[var(--om-fill)] px-[6px] text-[11px] leading-[18px] text-[var(--om-text-3)]">Archived</span> : null}
                  <span className="shrink-0 text-[12px] leading-[16px] text-[var(--om-text-3)]">{whenLabel(time)}</span>
                </div>
              </div>
            );
          })}

          {matches.length === 0 ? <div className="px-[10px] pt-[18px] text-center text-[13px] leading-[18px] text-[var(--om-text-3)]">No tasks match “{query.trim()}”</div> : null}
        </div>
      ) : loaded ? (
        <div className="flex flex-1 basis-0 flex-col items-center justify-center gap-[10px] pb-[30px]">
          <SquareDashed size={30} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-[var(--om-icon-3)]" />
          <button type="button" onClick={() => go("/app")} className="cursor-pointer rounded-[6px] text-[13px] leading-[18px] text-[var(--om-text-2)] outline-none transition-colors hover:text-[var(--om-text-1)] focus-visible:text-[var(--om-text-1)]">
            No tasks yet. Start one
          </button>
        </div>
      ) : (
        <div className="flex-1 basis-0" aria-busy="true" />
      )}
    </ModalShell>
  );
}
