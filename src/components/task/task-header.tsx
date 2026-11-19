"use client";

/**
 * Bar above the conversation: agent mode on the left; upgrade, share, usage, files, the task menu
 * and the panel toggle on the right. With the side panel open the labelled buttons shrink to icons.
 */
import { useEffect, type ReactNode } from "react";
import { ChartColumnBig, Clock, Ellipsis, Files, ListChecks, PanelRight, Share2, X } from "lucide-react";
import { brand, type ModeId } from "@/config/brand";
import { TaskMenu, taskUrl as absoluteTaskUrl } from "@/components/shell/task-menu";
import { onTaskPatched, useTasksStore } from "@/components/shell/tasks-store";
import { ProBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { CheckIcon, ChevronDownIcon, SparkleIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import type { TaskSummary } from "@/lib/agent/types";
import { useUI } from "@/lib/ui-store";
import { formatDuration } from "./parts";

const ICON_BUTTON =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)] data-[state=open]:text-[var(--om-icon-1)]";

function UsageRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex h-9 items-center gap-[10px] text-[14px] leading-5 text-[var(--om-text-1)]">
      <span className="flex size-[18px] shrink-0 items-center justify-center text-[var(--om-icon-2)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- mode */

/** Modes that carry the "Pro" chip, and the order they are listed in: the same as the picker on the home screen. */
const PRO_MODES: ReadonlySet<ModeId> = new Set<ModeId>(["max", "standard", "flex"]);
const LISTED_MODES: readonly ModeId[] = ["max", "standard", "lite", "flex"];

/**
 * The mode this task runs in. A task keeps the mode it was started with, so the menu lists the
 * other modes for information only, with the task's own one ticked.
 */
function TaskModePicker({ mode }: { mode: ModeId | null }) {
  if (!mode) return <span aria-hidden="true" className="h-8 w-[120px]" />;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`Agent mode: ${brand.modes[mode].label}`}
          className="group -ms-2 flex h-8 min-w-0 cursor-pointer items-center gap-1 rounded-[8px] pe-[6px] ps-2 text-[16px] font-medium leading-[22px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]"
        >
          <span className="truncate">{brand.modes[mode].label}</span>
          <ChevronDownIcon size={16} className="shrink-0 text-[var(--om-icon-2)] transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" sideOffset={6} className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[322px] overflow-y-auto p-[6px]">
        {LISTED_MODES.filter((id) => id !== "flex" || mode === "flex").map((id) => (
          <MenuItem key={id} disabled={id !== mode} onSelect={(event) => event.preventDefault()} className={cn("h-auto justify-between gap-3 px-3 py-2", id === mode && "cursor-default")}>
            <span className="flex min-w-0 flex-col gap-[2px]">
              <span className="flex items-center gap-[6px]">
                <span className="text-[13px] leading-[18px] text-[var(--om-text-1)]">{brand.modes[id].label}</span>
                {PRO_MODES.has(id) ? <ProBadge /> : null}
              </span>
              <span className={cn("text-[11.5px] leading-[15px] text-[var(--om-text-3)]", id === "max" && "max-w-[210px]")}>{brand.modes[id].description}</span>
            </span>
            {id === mode ? <CheckIcon size={15} className="shrink-0 text-[var(--om-icon-1)]" /> : null}
          </MenuItem>
        ))}
        <MenuSeparator className="mx-3 my-[2px]" />
        <MenuLabel className="px-3 pb-[6px] pt-[6px] text-[11.5px] leading-[15px]">Modes are fixed per task. To switch, open a new task.</MenuLabel>
      </MenuContent>
    </Menu>
  );
}

/* ---------------------------------------------------------------- header */

export interface TaskHeaderProps {
  taskId: string;
  title: string;
  /** The mode the task runs in; null until the task has loaded. */
  mode: ModeId | null;
  favorite: boolean;
  /** The task is archived (the menu then offers Unarchive). */
  archived?: boolean;
  /** Mock mode: nothing is sent to the server, so the items that change the task are left out. */
  mock: boolean;
  /** A rename or favourite change went through. */
  onPatched: (patch: Partial<TaskSummary>) => void;
  /** The side panel is open: compact buttons, bottom border, no panel toggle here. */
  panelOpen: boolean;
  /** The conversation is scrolled away from the top. */
  scrolled: boolean;
  busy: boolean;
  /** Number of tool calls so far. */
  steps: number;
  filesCount: number;
  /** Total time the agent has worked in this task. */
  workedMs: number;
  tokens: number | null;
  onOpenFiles: () => void;
  onTogglePanel: () => void;
  onStop: () => void;
  /** Buttons added before the usage button (collaboration, side chat). */
  extraActions?: ReactNode;
  /** The caller owns the task: Share and the task menu are offered. False for a collaborator. */
  owner?: boolean;
  /** No computer panel for this task (Chat mode). */
  hidePanelToggle?: boolean;
}

export function TaskHeader({ taskId, title, mode, favorite, archived = false, mock, onPatched, panelOpen, scrolled, steps, filesCount, workedMs, tokens, onOpenFiles, onTogglePanel, extraActions, owner = true, hidePanelToggle = false }: TaskHeaderProps) {
  const open = useUI((s) => s.open);
  const listed = useTasksStore((s) => s.tasks.find((t) => t.id === taskId));
  const share = () => open("share", { taskId, url: absoluteTaskUrl(taskId), title });

  // A rename, favourite or move made from any task menu (here or in the sidebar) updates this view too.
  useEffect(() => onTaskPatched((id, patch) => (id === taskId ? onPatched(patch) : undefined)), [taskId, onPatched]);

  return (
    <header className={cn("flex h-12 shrink-0 items-center justify-between gap-2 border-b pe-3 ps-6 transition-colors", panelOpen || scrolled ? "border-[var(--om-border)]" : "border-transparent")}>
      <TaskModePicker mode={mode} />

      <div className="flex shrink-0 items-center gap-1">
        {panelOpen ? (
          <Tooltip label="Upgrade">
            <button type="button" aria-label="Upgrade" onClick={() => open("upgrade-pro")} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-[var(--om-fill-accent)] text-[var(--om-text-accent)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85">
              <SparkleIcon size={16} />
            </button>
          </Tooltip>
        ) : (
          <button type="button" onClick={() => open("upgrade-pro")} className="flex h-8 shrink-0 cursor-pointer items-center gap-[6px] rounded-[10px] bg-[var(--om-fill-accent)] pe-[9px] ps-[8px] text-[14px] font-medium leading-5 text-[var(--om-text-accent)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85">
            <SparkleIcon size={16} />
            Upgrade
          </button>
        )}

        {!owner ? null : panelOpen ? (
          <Tooltip label="Share">
            <button type="button" aria-label="Share" onClick={share} className={ICON_BUTTON}>
              <Share2 size={17} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <button type="button" onClick={share} className="flex h-8 shrink-0 cursor-pointer items-center gap-[3px] rounded-[8px] px-2 text-[14px] font-medium leading-5 text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)] focus-visible:bg-[var(--om-fill)]">
            <Share2 size={17} strokeWidth={1.7} aria-hidden="true" />
            Share
          </button>
        )}

        {extraActions}

        <Popover>
          <Tooltip label="Usage">
            <PopoverTrigger asChild>
              <button type="button" aria-label="Usage" className={ICON_BUTTON}>
                <ChartColumnBig size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent align="end" sideOffset={8} aria-label="About this task" className="flex w-[320px] max-w-[calc(100vw-24px)] flex-col px-4 pb-3 pt-3">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 break-words pt-[3px] text-[15px] font-semibold leading-[22px] text-[var(--om-text-1)]">{title}</span>
              <PopoverClose aria-label="Close" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-3)] outline-none hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]">
                <X size={15} aria-hidden="true" />
              </PopoverClose>
            </div>
            <div className="pb-1 pt-3 text-[12px] font-medium leading-4 text-[var(--om-text-3)]">Usage</div>
            <UsageRow icon={<Clock size={16} strokeWidth={1.7} aria-hidden="true" />} label="Active time" value={formatDuration(workedMs)} />
            <UsageRow icon={<ListChecks size={16} strokeWidth={1.7} aria-hidden="true" />} label="Tool calls" value={String(steps)} />
            {tokens !== null ? <UsageRow icon={<SparkleIcon size={16} />} label="Tokens" value={tokens.toLocaleString()} /> : null}
            <UsageRow icon={<Files size={16} strokeWidth={1.7} aria-hidden="true" />} label="Files" value={String(filesCount)} />
          </PopoverContent>
        </Popover>

        <Tooltip label="Task files">
          <button type="button" aria-label="Task files" onClick={onOpenFiles} className={ICON_BUTTON}>
            <Files size={18} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </Tooltip>

        {mock || !owner ? null : (
          <TaskMenu task={{ id: taskId, title, favorite, projectId: listed?.projectId ?? null, archived: listed ? listed.archived === true : archived }} variant="header" align="end">
            <button type="button" aria-label="More" title="More" className={ICON_BUTTON}>
              <Ellipsis size={18} aria-hidden="true" />
            </button>
          </TaskMenu>
        )}

        {panelOpen || hidePanelToggle ? null : (
          <Tooltip label="Open side panel">
            <button type="button" aria-label="Open side panel" onClick={onTogglePanel} className={ICON_BUTTON}>
              <PanelRight size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>

    </header>
  );
}
