// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The cards under the Home headline and the "More ideas" panel. Generator entries appear only when the generator works for
 * this user (`useGeneratorAvailability`); each one prefills the composer and picks its generator.
 */
import { cn } from "@/components/ui/cn";
import {
  AudioIcon,
  AutomationIcon,
  ChartIcon,
  CloseIcon,
  DocumentIcon,
  GamepadIcon,
  ImageIcon,
  MoreIcon,
  SlidesIcon,
  TableIcon,
  TelescopeIcon,
  VideoIcon,
  WebsiteIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { GENERATOR_ENTRIES, type HomeEntry } from "@/lib/generators/registry";
import type { GeneratorAvailability } from "@/lib/generators/types";

export interface Action {
  id: string;
  label: string;
  icon: IconComponent;
  /** Text placed in the composer; the caret lands after it. */
  prompt: string;
  /** Icon colour classes for the headline cards (light and dark). */
  tone?: string;
  /** The generator this entry starts, when it is one. */
  entry?: HomeEntry;
}

const ICONS: Record<string, IconComponent> = { slides: SlidesIcon, research: TelescopeIcon, video: VideoIcon, spreadsheet: TableIcon, image: ImageIcon, visualization: ChartIcon, audio: AudioIcon };
const TONES: Record<string, string> = {
  slides: "text-[#f25a5a] dark:text-[#eb4d4d]",
  research: "text-[#25ba3b] dark:text-[#5eb92d]",
  video: "text-[#efa201] dark:text-[#ffbf36]",
  spreadsheet: "text-[#8b5cf6] dark:text-[#a78bfa]",
};

const WEBSITE: Action = { id: "website", label: "Make a site", icon: WebsiteIcon, prompt: "Make a site for ", tone: "text-[#0081f2] dark:text-[#1a93fe]" };
/** Plain agent tasks (no generator): always offered in "More ideas". */
const PLAIN_MORE: Action[] = [
  { id: "game", label: "Browser game", icon: GamepadIcon, prompt: "Code a small browser game in which " },
  { id: "document", label: "Write-up", icon: DocumentIcon, prompt: "Draft a write-up on " },
  { id: "automation", label: "Recurring job", icon: AutomationIcon, prompt: "Every weekday at 9am, " },
];

const toAction = (entry: HomeEntry): Action => ({ id: entry.id, label: entry.label, icon: ICONS[entry.id] ?? DocumentIcon, prompt: entry.prompt, tone: TONES[entry.id], entry });

/** Headline cards and panel entries for this user's available generators. */
export function homeActions(available: GeneratorAvailability[]): { quick: Action[]; more: Action[] } {
  const ok = (e: HomeEntry) => available.some((g) => g.kind === e.kind && g.available);
  const live = GENERATOR_ENTRIES.filter(ok);
  const quick = [WEBSITE, ...live.filter((e) => e.place === "quick").map(toAction)].slice(0, 4);
  const inQuick = new Set(quick.map((a) => a.id));
  const more = [PLAIN_MORE[0], ...live.filter((e) => !inQuick.has(e.id)).map(toAction), ...PLAIN_MORE.slice(1)];
  return { quick, more };
}

/** Entry card: 112 px tall, 12 px radius, 12 / 16 px padding, a 24 px glyph over a 14 px medium label. */
const CARD =
  "flex h-[112px] min-w-0 cursor-pointer select-none flex-col items-stretch rounded-[12px] bg-[var(--om-surface)] px-[12px] py-[16px] text-start outline-none shadow-[0_0_0_1px_var(--om-shadow-highlight),0_0_0_.5px_#00000014,0_1px_2px_0_var(--om-shadow-md)] hover:bg-[var(--om-fill-subtle)] hover:shadow-none hover:ring-[0.5px] hover:ring-inset hover:ring-[var(--om-border-strong)] focus-visible:ring-[0.5px] focus-visible:ring-inset focus-visible:ring-[var(--om-border-focus)] dark:shadow-[0_0_0_1px_var(--om-shadow-highlight),0_1px_2px_0_var(--om-shadow-md)] dark:hover:bg-[linear-gradient(var(--om-fill-subtle),var(--om-fill-subtle))] dark:hover:shadow-none";
const CARD_BODY = "flex h-full min-h-0 min-w-0 flex-col items-start justify-between";
const CARD_LABEL = "w-full truncate text-[14px] font-medium leading-[20px] text-[#34322d] dark:text-[#dadada]";

export function QuickActions({ actions, onPick, onExplore, className }: { actions: Action[]; onPick: (action: Action) => void; onExplore: () => void; className?: string }) {
  return (
    <div className={cn("@container w-full", className)}>
      <div className="grid w-full grid-cols-3 gap-[12px] @[760px]:grid-cols-5">
        {actions.map((action) => (
          <button key={action.id} type="button" onClick={() => onPick(action)} className={CARD}>
            <span className={CARD_BODY}>
              <action.icon size={24} strokeWidth={2} className={action.tone} />
              <span className={CARD_LABEL}>{action.label}</span>
            </span>
          </button>
        ))}
        <button type="button" onClick={onExplore} className={CARD}>
          <span className={CARD_BODY}>
            <MoreIcon size={24} className="text-[#858481] dark:text-[#7f7f7f]" />
            <span className={CARD_LABEL}>More ideas</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** Inline panel that opens above the composer, at the composer's width. */
export function ExploreMore({ actions, onPick, onClose, className }: { actions: Action[]; onPick: (action: Action) => void; onClose: () => void; className?: string }) {
  return (
    <section aria-label="More ideas" className={cn("@container/explore pointer-events-auto w-full", className)}>
      <div className="max-h-[calc(100dvh-220px)] w-full overflow-hidden overflow-y-auto overscroll-contain rounded-[12px] border-[0.5px] border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[12px]">
        <div className="flex w-full flex-col gap-[4px]">
          <div className="flex min-h-[32px] w-full items-center justify-between gap-[8px] ps-[12px]">
            <h2 className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">More ideas</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="flex size-[32px] cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]">
              <CloseIcon size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-[12px] @[400px]/explore:grid-cols-2 @[560px]/explore:grid-cols-3 @[728px]/explore:grid-cols-4">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onPick(action)}
                className="flex w-full cursor-pointer select-none flex-col items-start justify-start gap-[8px] rounded-[12px] border border-[var(--om-border)] px-[16px] pb-[14px] pt-[16px] text-start outline-none hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]"
              >
                <span className="flex w-full items-center text-[var(--om-icon-2)]">
                  <span className="flex size-[20px] shrink-0 items-center justify-center">
                    <action.icon size={20} />
                  </span>
                </span>
                <span className="line-clamp-2 w-full min-w-0 text-[14px] font-normal leading-[20px] text-[var(--om-text-1)]">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
