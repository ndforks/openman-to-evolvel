"use client";

/**
 * Settings → Skills: the skills on the user's computer, each with its switch.
 * Personal = written by the user or the agent; Official = Hermes' built-in and official-library skills;
 * Third-party = installed from GitHub or a community hub. "+ Add" offers the same four paths as the Skills page.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Plus, Shield } from "lucide-react";
import { useThemeClass } from "@/components/modals/theme";
import { ADD_OPTIONS, AddSkillDialog, RECORD_SKILL_HREF, type AddMode } from "@/components/pages/skills/AddSkillDialog";
import { prettyName } from "@/components/pages/skills/SkillCover";
import { SkillDetailDialog } from "@/components/pages/skills/SkillDetailDialog";
import { Button, LINK_BUTTON, Pane, SearchField, Toggle, cn } from "@/components/settings/ui";
import { toast } from "@/components/ui/toast";
import { setEnabled, useSkills, type SkillInfo } from "@/lib/skills/client";
import { officialByName } from "@/lib/skills/official";
import { useUI } from "@/lib/ui-store";

const EXPLORE_HREF = "/app/skills";

type Origin = "personal" | "official" | "third-party";
type Filter = "all" | Origin;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "personal", label: "Personal" },
  { id: "official", label: "Official" },
  { id: "third-party", label: "Third-party" },
];

const MENU_CONTENT = "z-[120] min-w-[220px] rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] font-sans text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]";
const MENU_ITEM = "flex h-[32px] cursor-pointer select-none items-center gap-[8px] rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]";

function originOf(s: SkillInfo): Origin {
  if (s.source === "local") return s.name === "orgo" ? "official" : "personal";
  if (s.source === "builtin" || s.hubSource === "official" || officialByName(s.name)) return "official";
  return "third-party";
}

function fmtDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ShieldGlyph() {
  return (
    <Shield size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
  );
}

function SkillCard({ skill, onOpen }: { skill: SkillInfo; onOpen: () => void }) {
  const origin = originOf(skill);
  const title = officialByName(skill.name)?.title ?? prettyName(skill.name);
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} className="flex min-w-0 cursor-pointer flex-col rounded-[12px] border-[0.5px] border-[var(--om-border-strong)] bg-[var(--om-card)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]">
      <div className="mt-[12px] flex h-[28px] items-center justify-between gap-[8px] pe-[12px] ps-[16px]">
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</p>
        <span onClick={(e) => e.stopPropagation()} className="flex">
          <Toggle size="sm" checked={skill.enabled} onCheckedChange={(next) => void setEnabled(skill.name, next).catch((err: Error) => toast(err.message, "error"))} label={`Enable ${title}`} />
        </span>
      </div>
      <div className="mt-[4px] flex flex-col px-[16px]">
        <p className="line-clamp-3 h-[48px] break-words text-[12px] leading-[16px] text-[var(--om-text-3)]">{skill.description}</p>
      </div>
      <div className="flex min-w-0 items-center gap-[4px] px-[16px] pb-[16px] pt-[12px] text-[11px] leading-[13px] text-[var(--om-text-3)]">
        {origin === "official" ? <ShieldGlyph /> : null}
        <p className="truncate whitespace-nowrap">{origin === "personal" ? `Added by you · ${fmtDate(skill.updatedAt)}` : `Updated on ${fmtDate(skill.updatedAt)}`}</p>
      </div>
    </div>
  );
}

export default function SkillsTab() {
  const themeClass = useThemeClass();
  const close = useUI((s) => s.close);
  const { skills, loading, error } = useSkills();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Exclude<AddMode, "official"> | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rank = (s: SkillInfo) => (s.source === "local" ? 0 : s.source === "hub" ? 1 : 2);
    return (skills ?? [])
      .filter((s) => (filter === "all" || originOf(s) === filter) && (!needle || s.name.includes(needle) || s.description.toLowerCase().includes(needle)))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [skills, filter, query]);

  return (
    <Pane title="Skills">
      <div className="flex w-full items-center justify-between gap-[12px] pt-[24px]">
        <SearchField value={query} onChange={setQuery} placeholder="Search skills" />
        <div className="flex shrink-0 items-center gap-[8px]">
          <Link
            href={EXPLORE_HREF}
            onClick={close}
            className={cn(LINK_BUTTON, "cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]")}
          >
            Explore skills
          </Link>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button>
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Add
                <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className={cn(themeClass, MENU_CONTENT)}>
                {ADD_OPTIONS.map((option) =>
                  option.id === "official" || option.id === "record" ? (
                    <DropdownMenu.Item key={option.id} asChild className={MENU_ITEM}>
                      <Link href={option.id === "record" ? RECORD_SKILL_HREF : `${EXPLORE_HREF}?add=official`} onClick={close}>
                        {option.label}
                      </Link>
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item key={option.id} className={MENU_ITEM} onSelect={() => setDialog(option.id as Exclude<AddMode, "official">)}>
                      {option.label}
                    </DropdownMenu.Item>
                  ),
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div role="tablist" aria-label="Skill source" className="flex min-h-[32px] flex-wrap items-center gap-[4px] pb-[12px] pt-[12px]">
        {FILTERS.map((item) => {
          const active = item.id === filter;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(item.id)}
              className={cn(
                "flex h-[32px] min-w-[48px] cursor-pointer items-center justify-center whitespace-nowrap rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
                active ? "bg-[var(--om-fill-strong)] font-medium text-[var(--om-text-1)]" : "font-normal text-[var(--om-text-3)] hover:bg-[var(--om-fill-subtle)]",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2">
          {visible.map((skill) => (
            <SkillCard key={skill.name} skill={skill} onOpen={() => setOpen(skill.name)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-[5px] py-[72px]">
          <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{!skills && loading ? "Reading skills from your computer…" : error && !skills ? "Skills couldn't be loaded" : "No skills found"}</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{error && !skills ? error : query.trim() ? "Try a different search." : "Add a skill and it lands here."}</div>
        </div>
      )}

      {open ? <SkillDetailDialog name={open} official={officialByName(open)} onClose={() => setOpen(null)} /> : null}
      {dialog ? <AddSkillDialog mode={dialog} onClose={() => setDialog(null)} onOpen={(name) => { setDialog(null); setOpen(name); }} /> : null}
    </Pane>
  );
}
