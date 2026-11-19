"use client";

/**
 * The menu that opens above the input when the text starts with "/":
 * places to pull context from, then the task starters. The composer owns the keyboard; this only draws the list.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Layers, MessageCircle } from "lucide-react";
import { BrandIcon } from "@/components/ui/brand-icon";
import { cn } from "@/components/ui/cn";
import {
  AudioIcon,
  AutomationIcon,
  ChartIcon,
  ChevronRightIcon,
  DocumentIcon,
  GamepadIcon,
  ImageIcon,
  LibraryIcon,
  ListIcon,
  PaperclipIcon,
  PluginsIcon,
  PuzzleIcon,
  SlidesIcon,
  TableIcon,
  TelescopeIcon,
  VideoIcon,
  WebsiteIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { MENU_SURFACE, usePortalThemeClass } from "@/components/ui/theme";
import { getSkillsSnapshot, refreshSkills, skillPrefix, type SkillInfo } from "@/lib/skills/client";

export interface SlashItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Draws a chevron: the item leads somewhere else. */
  more?: boolean;
  trailing?: ReactNode;
  /** Text that replaces the input when picked. */
  insert?: string;
  /** Place the composer opens when picked (the input is cleared first). */
  action?: SlashAction;
  /** First item of the second group: a hairline is drawn above it. */
  startsGroup?: boolean;
}

export type SlashAction = "skills" | "local-files" | "library" | "recent-tasks" | "other-sources" | "chat" | "plan";

/** The three source logos, each in a 20 px ringed circle, overlapping by 6 px. */
function SourceLogos() {
  const chip = "-ms-[6px] flex size-[20px] items-center justify-center rounded-full border border-[var(--om-border)] bg-[var(--om-card)] p-[2px] first:ms-0";
  return (
    <span className="ms-auto flex shrink-0 items-center">
      {["googledrive-color", "onedrive-c", "figma-c"].map((file) => (
        <span key={file} className={chip}>
          <BrandIcon src={`/brands/${file}.svg`} size={14} />
        </span>
      ))}
    </span>
  );
}

/** Task starters. Each fills the input with an opening line the user finishes. */
const STARTERS: readonly { label: string; icon: IconComponent; insert: string }[] = [
  { label: "Slide deck", icon: SlidesIcon, insert: "Put together a slide deck on " },
  { label: "Website", icon: WebsiteIcon, insert: "Make a site for " },
  { label: "Browser game", icon: GamepadIcon, insert: "Code a small browser game in which " },
  { label: "Picture", icon: ImageIcon, insert: "Draw a picture of " },
  { label: "Short video", icon: VideoIcon, insert: "Produce a short video on " },
  { label: "Recurring job", icon: AutomationIcon, insert: "Every weekday at 9am, " },
  { label: "Sheet", icon: TableIcon, insert: "Build a sheet that tracks " },
  { label: "Deep dive", icon: TelescopeIcon, insert: "Dig into " },
  { label: "Chart", icon: ChartIcon, insert: "Chart " },
  { label: "Voice-over", icon: AudioIcon, insert: "Record a voice-over that says " },
  { label: "Write-up", icon: DocumentIcon, insert: "Draft a write-up on " },
];

const ICON = { size: 16, strokeWidth: 2 } as const;

function buildSlashItems(): SlashItem[] {
  const starters = STARTERS.map<SlashItem>(({ label, icon: Icon, insert }, index) => ({
    id: `start-${label}`,
    label,
    icon: <Icon {...ICON} />,
    insert,
    startsGroup: index === 0,
  }));
  return [
    { id: "plan", label: "Plan", icon: <Layers {...ICON} />, action: "plan", trailing: <span className="ms-auto text-[12px] text-[var(--om-text-3)]">Agree steps first</span> },
    { id: "chat", label: "Chat mode", icon: <MessageCircle {...ICON} />, action: "chat", trailing: <span className="ms-auto text-[12px] text-[var(--om-text-3)]">Just talk</span> },
    { id: "skills", label: "Skills", icon: <PuzzleIcon {...ICON} />, more: true, action: "skills" },
    { id: "local-files", label: "Local files", icon: <PaperclipIcon size={16} />, action: "local-files" },
    { id: "library", label: "Library", icon: <LibraryIcon size={16} />, more: true, action: "library" },
    { id: "recent-tasks", label: "Recent tasks", icon: <ListIcon {...ICON} />, more: true, action: "recent-tasks" },
    { id: "other-sources", label: "Cloud drives", icon: <PluginsIcon {...ICON} />, more: true, trailing: <SourceLogos />, action: "other-sources" },
    ...starters,
  ];
}

export const SLASH_ITEMS: readonly SlashItem[] = buildSlashItems();

/* ---- the user's skills ----
 * Each enabled skill on the user's computer is an item that puts Hermes' own `/skill-name ` in front of the prompt,
 * so the task runs with that skill (the agent loads it before it starts). With nothing typed after the slash only
 * the user's own and installed skills show; typing searches Hermes' built-in ones too.
 * The list is fetched once shortly after the composer loads, so it is ready when "/" is typed.
 */
if (typeof window !== "undefined") window.setTimeout(() => void refreshSkills(), 1500);

function skillTitle(name: string): string {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function skillItem(skill: SkillInfo): SlashItem {
  return {
    id: `skill-${skill.name}`,
    label: skillTitle(skill.name),
    icon: <PuzzleIcon {...ICON} />,
    insert: skillPrefix(skill.name),
  };
}

function skillItems(needle: string): SlashItem[] {
  const skills = (getSkillsSnapshot() ?? []).filter((s) => s.enabled);
  const picked = needle
    ? skills.filter((s) => s.name.includes(needle) || skillTitle(s.name).toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle))
    : skills.filter((s) => s.source !== "builtin");
  return picked
    .sort((a, b) => Number(b.name.startsWith(needle)) - Number(a.name.startsWith(needle)) || a.name.localeCompare(b.name))
    .slice(0, needle ? 8 : 12)
    .map(skillItem);
}

/** Items whose label contains what was typed after the slash, with the user's matching skills after "Skills". */
export function filterSlashItems(items: readonly SlashItem[], query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  const base = needle ? items.filter((item) => item.label.toLowerCase().includes(needle)) : [...items];
  const skills = skillItems(needle);
  if (!skills.length) return base;
  const at = base.findIndex((item) => item.id === "skills");
  // Without the "Skills" row, the app's own modes and places (Plan, Chat mode...) still come before skills.
  return at >= 0 ? [...base.slice(0, at + 1), ...skills, ...base.slice(at + 1)] : [...base.filter((i) => i.action), ...skills, ...base.filter((i) => !i.action)];
}

export const SLASH_LIST_ID = "composer-slash-menu";
export const slashOptionId = (index: number) => `${SLASH_LIST_ID}-${index}`;

export function SlashMenu({ items, active, onActive, onPick, className }: { items: readonly SlashItem[]; active: number; onActive: (index: number) => void; onPick: (item: SlashItem) => void; className?: string }) {
  const theme = usePortalThemeClass();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector(`#${slashOptionId(active)}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    // 240 px wide, 12 px radius, menu shadow; the list scrolls inside at most 280 px.
    <div
      id={SLASH_LIST_ID}
      role="listbox"
      aria-label="Commands"
      // Keep the caret in the input while the pointer works the list.
      onMouseDown={(event) => event.preventDefault()}
      className={cn(theme, MENU_SURFACE, "z-30 flex w-[240px] flex-col overflow-hidden rounded-[12px] p-0 text-[14px] leading-[20px] backdrop-blur-[40px]", className)}
    >
      <div ref={listRef} className="max-h-[280px] min-h-0 flex-1 overflow-y-auto py-[4px] [scrollbar-width:none]">
        {items.map((item, index) => (
          <div key={item.id} role="presentation" className="flex shrink-0 flex-col">
            {item.startsGroup && index > 0 ? <div className="mx-[12px] my-[4px] h-px shrink-0 bg-[var(--om-border)]" /> : null}
            <div
              id={slashOptionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => {
                if (index !== active) onActive(index);
              }}
              onClick={() => onPick(item)}
              className={cn("mx-[4px] flex min-h-[36px] shrink-0 cursor-pointer select-none items-center gap-[8px] rounded-[8px] px-[8px] text-[var(--om-text-1)]", index === active && "bg-[var(--om-fill)]")}
            >
              <span className="flex size-[20px] shrink-0 items-center justify-center text-[var(--om-icon-1)]">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.trailing}
              {item.more ? <ChevronRightIcon size={16} className={cn("shrink-0 text-[var(--om-icon-3)]", item.trailing ? "ms-[4px]" : "ms-auto")} /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
