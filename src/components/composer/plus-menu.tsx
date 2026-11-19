"use client";

/** The "+" button in the input toolbar and its menu: file sources, skills, recent tasks, library and local files. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Layers, MessageCircle } from "lucide-react";
import type { TaskReference } from "@/lib/agent/types";
import { BrandIcon } from "@/components/ui/brand-icon";
import { ChevronRightIcon, LibraryIcon, ListIcon, PaperclipIcon, PlusIcon, PuzzleIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { taskHref } from "@/components/shell/task-list";
import { useTasksStore } from "@/components/shell/tasks-store";
import { useUI } from "@/lib/ui-store";

/** The "+" button: a 32 px circle with a 1 px border and a 17 px plus. */
export const TOOL_BUTTON =
  "inline-flex size-[32px] shrink-0 cursor-pointer select-none items-center justify-center rounded-full border border-[var(--om-border)] p-0 text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)] data-[state=open]:bg-[var(--om-fill-subtle)]";

const RECENT_LIMIT = 8;
const chevron = <ChevronRightIcon size={16} className="ms-[8px] shrink-0 text-[var(--om-icon-3)]" />;

/** Menu glyph: 16 px inside the 20 px box every menu row uses. */
function Glyph({ children }: { children: ReactNode }) {
  return <span className="flex size-[20px] shrink-0 items-center justify-center">{children}</span>;
}

function Row({ icon, label, onSelect, more = false }: { icon: ReactNode; label: string; onSelect: () => void; more?: boolean }) {
  return (
    <MenuItem onSelect={onSelect}>
      <Glyph>{icon}</Glyph>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {more ? chevron : null}
    </MenuItem>
  );
}

export interface PlusMenuProps {
  onPickFiles: () => void;
  /** Recent tasks are added to the message as references (the agent reads them on demand) instead of opened. */
  onReference?: (ref: TaskReference) => void;
  /** Task ids not to offer (the task being worked on, ones already referenced). */
  excludeIds?: string[];
  /** Offers "Chat mode" (a light Q&A conversation, no computer) for the next task. */
  onChatMode?: () => void;
  /** Offers "Plan mode" (a plan to confirm before anything runs). */
  onPlanMode?: () => void;
}

export function PlusMenu({ onPickFiles, onReference, excludeIds, onChatMode, onPlanMode }: PlusMenuProps) {
  const router = useRouter();
  const open = useUI((s) => s.open);
  const tasks = useTasksStore((s) => s.tasks);
  const connect = () => open("settings", { tab: "connectors" });

  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label="Add files and more" className={TOOL_BUTTON}>
          <PlusIcon size={17} />
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" sideOffset={4} className="w-max min-w-[110px]">
        <Row icon={<BrandIcon src="/brands/figma-c.svg" size={16} />} label="Figma file" onSelect={connect} />
        <Row icon={<BrandIcon src="/brands/onedrive-c.svg" size={16} />} label="OneDrive" onSelect={connect} more />
        <Row icon={<BrandIcon src="/brands/googledrive-color.svg" size={16} />} label="Google Drive" onSelect={connect} />
        <MenuSeparator className="mx-[12px]" />
        <Row icon={<PuzzleIcon size={16} strokeWidth={2} />} label="Skills" onSelect={() => router.push("/app/skills")} more />
        <MenuSub>
          <MenuSubTrigger chevron={false}>
            <Glyph>
              <ListIcon size={16} strokeWidth={2} />
            </Glyph>
            <span className="min-w-0 flex-1 truncate">Recent tasks</span>
            {chevron}
          </MenuSubTrigger>
          <MenuSubContent sideOffset={4} className="max-h-[min(440px,calc(var(--radix-dropdown-menu-content-available-height)-8px))] w-[320px] overflow-y-auto">
            {tasks.length === 0 ? (
              <MenuLabel className="py-[8px] text-[14px] leading-[20px]">No tasks yet</MenuLabel>
            ) : (
              tasks
                .filter((task) => !excludeIds?.includes(task.id))
                .slice(0, onReference ? 20 : RECENT_LIMIT)
                .map((task) =>
                  onReference ? (
                    <MenuItem key={task.id} data-reference-task={task.id} onSelect={() => onReference({ id: task.id, title: task.title || "New task" })}>
                      <span className="truncate">{task.title || "New task"}</span>
                    </MenuItem>
                  ) : (
                    <MenuItem key={task.id} asChild>
                      <Link href={taskHref(task.id)}>
                        <span className="truncate">{task.title || "New task"}</span>
                      </Link>
                    </MenuItem>
                  ),
                )
            )}
          </MenuSubContent>
        </MenuSub>
        <Row icon={<LibraryIcon size={16} />} label="Library" onSelect={() => router.push("/app/library")} more />
        <Row icon={<PaperclipIcon size={16} />} label="Local files" onSelect={onPickFiles} />
        {onChatMode || onPlanMode ? <MenuSeparator className="mx-[12px]" /> : null}
        {onChatMode ? <Row icon={<MessageCircle size={16} strokeWidth={2} />} label="Chat mode" onSelect={onChatMode} /> : null}
        {onPlanMode ? <Row icon={<Layers size={16} strokeWidth={2} />} label="Plan mode" onSelect={onPlanMode} /> : null}
      </MenuContent>
    </Menu>
  );
}
