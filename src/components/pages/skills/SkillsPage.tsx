"use client";

/**
 * Skills page. The grid shows the official library (skills Hermes and Anthropic publish,
 * installed with Hermes' own installer); "My skills" shows what is actually on the user's computer. "Create" offers
 * the four ways to add one. Opening a card shows its detail with the SKILL.md editor.
 *
 * `?add=build|upload|github|official` (and `&task=<id>` for build) opens that path directly, so the Settings tab
 * and the task view can link here.
 */
import { Check, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { installOfficial, useSkills, type SkillInfo } from "@/lib/skills/client";
import { OFFICIAL_CATEGORIES, OFFICIAL_SKILLS, type OfficialCategory, type OfficialSkill } from "@/lib/skills/official";
import { cx } from "../cx";
import { CreateMenu, OutlineButton, PageShell, PillTabs, PluginsSkillsTitle, SearchField, type PillTab } from "../ui";
import { ADD_OPTIONS, AddSkillDialog, RECORD_SKILL_HREF, type AddMode } from "./AddSkillDialog";
import { SkillCover, prettyName } from "./SkillCover";
import { SkillDetailDialog } from "./SkillDetailDialog";

type Filter = "All" | OfficialCategory;

const TABS: PillTab<Filter>[] = [{ id: "All", label: "All" }, ...OFFICIAL_CATEGORIES.map((c) => ({ id: c, label: c }))];

const CHIP = "flex shrink-0 items-center gap-[4px] whitespace-nowrap rounded-[4px] bg-[var(--om-fill)] px-[4px] py-[2px] text-[12px] leading-[16px] text-[var(--om-text-2)]";

interface CardModel {
  name: string;
  title: string;
  description: string;
  author: { hermes: true } | { hermes?: false; label: string };
  chips: string[];
  stat: string;
  cover?: [string, string];
  official?: OfficialSkill;
  installed: SkillInfo | null;
}

function fromOfficial(o: OfficialSkill, installed: SkillInfo | null): CardModel {
  return {
    name: o.name,
    title: o.title,
    description: o.description,
    author: o.publisher === "Nous Research" ? { hermes: true } : { label: o.publisher },
    chips: o.categories,
    stat: `${o.license} · ${o.publisher}`,
    cover: o.cover,
    official: o,
    installed,
  };
}

function fromInstalled(s: SkillInfo, official?: OfficialSkill): CardModel {
  const author: CardModel["author"] = s.source === "builtin" || s.hubSource === "official" ? { hermes: true } : { label: s.source === "local" ? "You" : s.author?.split(/[,(]/)[0].trim() || s.hubSource || "Community" };
  return {
    name: s.name,
    title: official?.title ?? prettyName(s.name),
    description: s.description,
    author,
    chips: official?.categories ?? (s.category ? [prettyName(s.category)] : []),
    stat: `${s.enabled ? "On" : "Off"} · ${s.source === "builtin" ? "Built in" : s.source === "hub" ? `From ${s.hubSource ?? "hub"}` : "Personal"}`,
    cover: official?.cover,
    official,
    installed: s,
  };
}

function SkillCard({ card, onOpen, onAdd, adding }: { card: CardModel; onOpen: () => void; onAdd?: () => void; adding?: boolean }) {
  return (
    <li className="group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[12px] border border-[var(--om-btn-border)] bg-[var(--om-card)] transition-shadow hover:shadow-[0_0_0_1px_var(--om-shadow-highlight),0_0_0_0.5px_var(--om-shadow-md),0_24px_24px_-12px_var(--om-shadow-sm),0_3px_3px_-1.5px_var(--om-shadow-md),0_10px_20px_1px_var(--om-shadow-sm)]" onClick={onOpen}>
      <div className="flex h-[149px] shrink-0 items-start justify-center overflow-hidden bg-[var(--om-fill)] pt-[24px]">
        <SkillCover name={card.name} title={card.title} colors={card.cover} />
      </div>
      <div className="flex w-full flex-col gap-[8px] px-[16px] pt-[12px]">
        <div className="flex flex-col gap-[2px]">
          <p className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{card.title}</p>
          <p className="line-clamp-2 h-[32px] break-words text-[12px] leading-[16px] text-[var(--om-text-3)]">{card.description}</p>
        </div>
        <div className="flex items-center gap-[4px] overflow-hidden">
          {card.author.hermes ? (
            <span className={CHIP}>
              <span className="size-[12px] shrink-0 rounded-full bg-[#6E56CF]" />
              Hermes
            </span>
          ) : (
            <span className={CHIP}>
              <span className="size-[12px] shrink-0 rounded-full bg-[#8C8C8C]" />
              {card.author.label}
            </span>
          )}
          {card.chips.slice(0, 2).map((chip) => (
            <span key={chip} className={CHIP}>
              {chip}
            </span>
          ))}
        </div>
      </div>
      <div className="flex h-[48px] w-full items-center justify-between pe-[10px] ps-[16px]">
        <p className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">{card.stat}</p>
        {card.official ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!card.installed) onAdd?.();
              else onOpen();
            }}
            disabled={adding}
            title={adding ? "Adding" : card.installed ? "Added" : "Add"}
            aria-label={card.installed ? `${card.title} is in your skills` : `Add ${card.title} to my skills`}
            className={cx(
              "flex size-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--om-btn-border)] text-[var(--om-icon-1)] outline-none transition-opacity hover:bg-[var(--om-fill)] focus-visible:opacity-100",
              card.installed || adding ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : card.installed ? <Check size={16} strokeWidth={2} aria-hidden /> : <Plus size={16} strokeWidth={2} aria-hidden />}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function SkillsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [onlyMine, setOnlyMine] = useState(false);
  const [open, setOpen] = useState<{ name: string; official?: OfficialSkill } | null>(null);
  const [dialog, setDialog] = useState<{ mode: Exclude<AddMode, "official">; taskId?: string } | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const { skills, loading, error } = useSkills();

  useEffect(() => {
    // Deferred one tick: the URL is only readable in the browser, after hydration.
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const add = params.get("add");
      if (add === "build" || add === "upload" || add === "github") setDialog({ mode: add, taskId: params.get("task") ?? undefined });
      if (params.get("mine") === "1") setOnlyMine(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const byName = useMemo(() => new Map((skills ?? []).map((s) => [s.name, s])), [skills]);

  const cards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (c: CardModel) => !needle || c.title.toLowerCase().includes(needle) || c.name.includes(needle) || c.description.toLowerCase().includes(needle);
    if (onlyMine) {
      const list = (skills ?? []).map((s) => fromInstalled(s, OFFICIAL_SKILLS.find((o) => o.name === s.name)));
      // The user's own and installed skills first, then Hermes' built-in ones.
      const rank = (c: CardModel) => (c.installed?.source === "local" ? 0 : c.installed?.source === "hub" ? 1 : 2);
      return list.filter(match).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    }
    return OFFICIAL_SKILLS.filter((o) => filter === "All" || o.categories.includes(filter))
      .map((o) => fromOfficial(o, byName.get(o.name) ?? null))
      .filter(match);
  }, [onlyMine, skills, query, filter, byName]);

  const add = async (o: OfficialSkill) => {
    setAdding((s) => new Set(s).add(o.name));
    try {
      await installOfficial(o.name);
      toast(`${o.title} added. Type /${o.name} in a task to use it.`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setAdding((s) => {
        const next = new Set(s);
        next.delete(o.name);
        return next;
      });
    }
  };

  const onCreate = (id: string) => {
    if (id === "record") {
      router.push(RECORD_SKILL_HREF);
      return;
    }
    if (id === "official") {
      setOnlyMine(false);
      setFilter("All");
      return;
    }
    setDialog({ mode: id as Exclude<AddMode, "official"> });
  };

  return (
    <PageShell
      title={<PluginsSkillsTitle active="skills" />}
      actions={
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Search" ariaLabel="Search skills" className="h-[32px] w-[240px] max-md:w-[140px]" />
          <OutlineButton aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)} className={onlyMine ? "border-[var(--om-border-focus)] bg-[var(--om-fill)]" : undefined}>
            My skills
          </OutlineButton>
          <CreateMenu options={ADD_OPTIONS} onSelect={onCreate} />
        </>
      }
    >
      {onlyMine ? (
        <div className="flex h-[32px] items-center gap-[8px] pt-[2px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
          {skills ? `${skills.length} skills on your computer` : loading ? "Reading skills from your computer…" : null}
          {loading && skills ? <Loader2 size={13} className="animate-spin" /> : null}
        </div>
      ) : (
        <PillTabs tabs={TABS} value={filter} onChange={setFilter} label="Skill categories" className="min-h-[32px] flex-wrap" />
      )}

      {error && onlyMine && !skills ? (
        <div className="pt-[40px] text-center text-[14px] text-[var(--om-danger)]">{error}</div>
      ) : cards.length > 0 ? (
        <ul className="grid grid-cols-1 gap-[16px] pb-[28px] pt-[12px] sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <SkillCard key={card.name} card={card} adding={adding.has(card.name)} onAdd={card.official ? () => void add(card.official!) : undefined} onOpen={() => setOpen({ name: card.name, official: card.official })} />
          ))}
        </ul>
      ) : onlyMine && !skills ? (
        <div className="flex justify-center pt-[72px]">
          <Loader2 size={18} className="animate-spin text-[var(--om-icon-3)]" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-[2px] pb-[80px] pt-[72px] text-center">
          <div className="text-[14px] font-semibold leading-[20px] text-[var(--om-text-1)]">Nothing matches</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">Change the search words or pick another category.</div>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("All");
              setOnlyMine(false);
            }}
            className="mt-[12px] cursor-pointer text-[13px] leading-[18px] text-[var(--om-text-accent)] outline-none hover:underline focus-visible:underline"
          >
            Browse all skills
          </button>
        </div>
      )}

      {open ? <SkillDetailDialog name={open.name} official={open.official} onClose={() => setOpen(null)} /> : null}
      {dialog ? <AddSkillDialog mode={dialog.mode} taskId={dialog.taskId} onClose={() => setDialog(null)} onOpen={(name) => { setDialog(null); setOnlyMine(true); setOpen({ name }); }} /> : null}
    </PageShell>
  );
}
