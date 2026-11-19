"use client";

/** "Upgrade": Orgo's three plans side by side, with a monthly / yearly switch and rows for teams and pay-as-you-go. */
import { useState, type ReactNode } from "react";
import {
  AppWindow,
  ArrowUpRight,
  Building2,
  Calendar,
  ChartLine,
  CircleUser,
  CodeXml,
  Cpu,
  File,
  FileSearch,
  FlaskConical,
  Globe,
  HardDrive,
  Headset,
  History,
  ListChecks,
  Lock,
  Monitor,
  Presentation,
  ShieldCheck,
  Sparkle,
  Target,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ModalShell, cn } from "@/components/modals/ModalShell";
import { HelpGlyph } from "@/components/settings/ui";
import { brand } from "@/config/brand";
import { openUpgrade, useCredits } from "@/lib/billing";
import { CREDITS, PLAN_TIERS, YEARLY_DISCOUNT_PERCENT, formatUsd, planFeatureLines, planPrice, planTier, type BillingPeriod, type PlanFeatureIcon, type PlanTier, type PlanTierId } from "@/lib/orgo/plans";
import { useUI } from "@/lib/ui-store";

export type { BillingPeriod };
/** The segmented switch's values. */
export type Billing = "monthly" | "annual";

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** "Annually · Save 20%" (Orgo: yearly is twelve months less 20%). */
export const ANNUAL_LABEL = `Annually · Save ${YEARLY_DISCOUNT_PERCENT}%`;

/* ---------- glyphs (lucide) ---------- */

const GLYPHS = {
  refresh: History,
  sparkle: Sparkle,
  research: FileSearch,
  codeWindow: CodeXml,
  window: AppWindow,
  slides: Presentation,
  target: Target,
  flask: FlaskConical,
  checklist: ListChecks,
  calendar: Calendar,
  user: User,
  file: File,
  userCircle: CircleUser,
  chart: ChartLine,
  lock: Lock,
  shield: ShieldCheck,
  building: Building2,
  arrowUpRight: ArrowUpRight,
  monitor: Monitor,
  cpu: Cpu,
  disk: HardDrive,
  globe: Globe,
  users: Users,
  headset: Headset,
} as const satisfies Record<string, LucideIcon>;

export type PlanGlyphName = keyof typeof GLYPHS;

/** 14px line icon used in the feature lists. */
export function PlanGlyph({ name, size = 14, strokeWidth = 1.7, className }: { name: PlanGlyphName; size?: number; strokeWidth?: number; className?: string }) {
  const Glyph = GLYPHS[name];
  return <Glyph size={size} strokeWidth={strokeWidth} aria-hidden="true" className={cn("shrink-0 text-[var(--om-icon-2)]", className)} />;
}

/* ---------- shared pieces ---------- */

/** Rounded 22px frame whose content scrolls while the close button stays put. */
export function PricingFrame({ title, className, contentClassName, children }: { title: string; className: string; contentClassName: string; children: ReactNode }) {
  return (
    <ModalShell
      title={title}
      closeClassName="right-[19px] top-[19px]"
      className={cn(
        "flex max-h-[calc(100vh-40px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[22px] border border-[var(--om-border-strong)] bg-[var(--om-bg-sidebar)] text-[12px] leading-[16px] shadow-[0_24px_64px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <div className={cn("flex min-h-0 flex-1 flex-col items-center overflow-y-auto [scrollbar-width:none]", contentClassName)}>{children}</div>
    </ModalShell>
  );
}

/** Monthly / Annually segmented switch. */
export function BillingToggle({ value, onChange, annualLabel, className }: { value: Billing; onChange: (next: Billing) => void; annualLabel: string; className?: string }) {
  const options: { id: Billing; label: string }[] = [
    { id: "monthly", label: "Monthly" },
    { id: "annual", label: annualLabel },
  ];
  return (
    <div role="radiogroup" aria-label="Billing period" className={cn("flex shrink-0 rounded-[10px] bg-[var(--om-fill)] p-[3px] dark:bg-[#2A2A2A]", className)}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex h-[26px] cursor-pointer items-center rounded-[8px] px-[12px] text-[12.5px] leading-[18px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
              active ? "bg-white text-[var(--om-text-1)] shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:bg-[#3A3A3A] dark:shadow-none" : "text-[var(--om-text-3)] hover:text-[var(--om-text-2)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 34px pill button at the top of a plan card. */
export function PlanButton({ tone, className, children, onClick }: { tone: "blue" | "light" | "outline"; className?: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[34px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[17px] text-[13px] font-medium leading-[17px] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
        tone === "blue" && "bg-[var(--om-btn-accent)] text-white",
        tone === "light" && "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]",
        tone === "outline" && "border border-[var(--om-border-focus)] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)] hover:opacity-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Small status line shown under a plan button after it is pressed. */
export function PlanNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="pt-[8px] text-center text-[11.5px] leading-[16px] text-[var(--om-text-3)]">
      {children}
    </div>
  );
}

/** Bordered 32px link styled as a button ("See team options", "Add credits"). */
const ROW_ACTION =
  "flex h-[32px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] border border-[var(--om-border-strong)] px-[12px] text-[13px] font-medium leading-[16px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]";

/* ---------- plan data (all from `@/lib/orgo/plans`) ---------- */

export interface PlanFeature {
  glyph: PlanGlyphName;
  text: string;
  /** Tooltip for the "?" shown after the text. */
  help?: string;
}

const FEATURE_GLYPH: Record<PlanFeatureIcon, PlanGlyphName> = {
  credits: "sparkle",
  computers: "monitor",
  cpu: "cpu",
  storage: "disk",
  os: "window",
  team: "users",
  domain: "globe",
  collab: "userCircle",
  templates: "file",
  data: "chart",
  support: "headset",
};

/** What a plan includes (`planFeatureLines` in the catalog), with this dialog's glyphs. */
export function tierFeatures(tier: PlanTier): PlanFeature[] {
  return planFeatureLines(tier).map((line) => ({ glyph: FEATURE_GLYPH[line.icon], text: line.text, help: line.help }));
}

/** The price block of a plan card, as Orgo shows it: per month, and for yearly the yearly total under it. */
export function TierPrice({ tier, period, size = "md" }: { tier: PlanTier; period: BillingPeriod; size?: "md" | "lg" }) {
  const price = planPrice(tier, period);
  return (
    <div className="flex flex-col">
      <div className={cn("font-semibold text-[var(--om-text-1)]", size === "lg" ? "text-[26px] leading-[32px]" : "text-[22px] leading-[28px]")}>
        {formatUsd(price.perMonthUsd)}
        <span className="text-[13px] font-normal text-[var(--om-text-3)]"> / month</span>
      </div>
      <div className="h-[17px] text-[11.5px] leading-[17px] text-[var(--om-text-3)]">{period === "yearly" ? `${formatUsd(price.billedUsd)} billed yearly` : "Billed monthly"}</div>
    </div>
  );
}

/** The Upgrade button's action: Orgo's billing page for this plan, in a new tab. */
export function useUpgrade(period: BillingPeriod) {
  const [opening, setOpening] = useState<PlanTierId | null>(null);
  const go = (tier: PlanTierId) => {
    setOpening(tier);
    void openUpgrade(tier, period).finally(() => setTimeout(() => setOpening(null), 1500));
  };
  return { opening, go };
}

/* ---------- modal ---------- */

function PlanCard({ tier, period, current, opening, onUpgrade }: { tier: PlanTier; period: BillingPeriod; current: boolean; opening: boolean; onUpgrade: () => void }) {
  const highlighted = !!tier.featured;
  return (
    <div
      className={cn(
        "relative flex min-h-[505px] min-w-0 flex-1 basis-0 flex-col rounded-[14px] bg-[var(--om-surface)] px-[14px] py-[18px]",
        highlighted ? "border-2 border-[var(--om-btn-accent)]" : "border border-[var(--om-fill-strong)]",
      )}
    >
      <div className="pb-[6px] text-[13px] font-medium leading-[18px] text-[var(--om-text-2)]">{tier.name}</div>
      <TierPrice tier={tier} period={period} />
      <div className="pt-[18px] text-[13px] leading-[17px] text-[var(--om-text-1)]">{tier.tagline}</div>

      <PlanButton tone={current ? "outline" : highlighted ? "blue" : "light"} className="mt-[12px]" onClick={onUpgrade}>
        {current ? "Manage plan" : `Choose ${tier.name}`}
      </PlanButton>
      {opening ? <PlanNotice>Opening Orgo billing…</PlanNotice> : null}

      <ul className="flex flex-col gap-[11px] pt-[16px]">
        {tierFeatures(tier).map((feature) => (
          <li key={feature.text} className="flex items-start gap-[8px]">
            <PlanGlyph name={feature.glyph} className="mt-[2px]" />
            <span className="text-[13px] leading-[18px] text-[var(--om-text-1)]">
              {feature.text}
              {feature.help ? (
                <span title={feature.help} className="ml-[5px] inline-flex translate-y-[2px]">
                  <HelpGlyph size={13} />
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {current ? (
        <div className="absolute right-[6px] top-[6px] flex h-[22px] items-center rounded-[6px] bg-[var(--om-fill)] px-[8px] text-[11.5px] font-medium leading-[17px] text-[var(--om-text-2)]">Current plan</div>
      ) : highlighted ? (
        <div className="absolute right-[6px] top-[6px] flex h-[22px] items-center rounded-[6px] bg-[var(--om-fill-accent)] px-[8px] text-[11.5px] font-medium leading-[17px] text-[var(--om-text-accent)]">Most picked</div>
      ) : null}
    </div>
  );
}

export function UpgradeProModal() {
  const open = useUI((s) => s.open);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const { opening, go } = useUpgrade(period);
  const { tier } = useCredits();
  const currentId = tier ? planTier(tier)?.id : undefined;
  const title = `Upgrade ${brand.name}`;

  return (
    <PricingFrame title={title} className="w-[964px]" contentClassName="px-[20px] pb-[20px] pt-[28px]">
      <h2 className="shrink-0 text-center font-serif text-[26px] leading-[34px] text-[var(--om-text-1)]">{title}</h2>
      <p className="shrink-0 pt-[6px] text-center text-[13.5px] leading-[19px] text-[var(--om-text-2)]">{brand.name} bills through your Orgo account: one plan covers the agent, its computers and its credits.</p>
      <BillingToggle className="mt-[16px]" value={period === "yearly" ? "annual" : "monthly"} annualLabel={ANNUAL_LABEL} onChange={(next) => setPeriod(next === "annual" ? "yearly" : "monthly")} />

      <div className="mt-[20px] flex w-full shrink-0 gap-[12px] max-[820px]:flex-col">
        {PLAN_TIERS.map((candidate) => (
          <PlanCard key={candidate.id} tier={candidate} period={period} current={candidate.id === currentId} opening={opening === candidate.id} onUpgrade={() => go(candidate.id)} />
        ))}
      </div>

      <div className="mt-[14px] flex h-[58px] w-full shrink-0 items-center gap-[12px] rounded-[12px] bg-[var(--om-surface)] px-[10px]">
        <div className="flex size-[36px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--om-fill)] dark:bg-[#2E2E2E]">
          <PlanGlyph name="building" size={17} strokeWidth={1.6} className="text-[var(--om-icon-1)]" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <div className="font-serif text-[14px] font-bold leading-[19px] text-[var(--om-text-1)]">Working as a team?</div>
          <div className="text-[12.5px] leading-[17px] text-[var(--om-text-3)]">Scale seats up to 25 people. Bigger groups get custom limits and an SLA through Orgo Enterprise.</div>
        </div>
        <button type="button" onClick={() => open("team-plan")} className={ROW_ACTION}>
          See team options
        </button>
      </div>

      <div className="mt-[10px] flex min-h-[58px] w-full shrink-0 items-center gap-[12px] rounded-[12px] bg-[var(--om-surface)] px-[10px] py-[8px]">
        <div className="flex size-[36px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--om-fill)] dark:bg-[#2E2E2E]">
          <PlanGlyph name="sparkle" size={17} strokeWidth={1.6} className="text-[var(--om-icon-1)]" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <div className="text-[13.5px] font-medium leading-[19px] text-[var(--om-text-1)]">Prefer no subscription?</div>
          <div className="text-[12.5px] leading-[17px] text-[var(--om-text-3)]">
            Top up credits instead (1 credit = $1), anywhere from {formatUsd(CREDITS.topUpMinCents / 100)} to {formatUsd(CREDITS.topUpMaxCents / 100)}. Model usage is billed at list price plus {CREDITS.modelMarkupPercent}%.
          </div>
        </div>
        <button type="button" onClick={() => open("settings", { tab: "billing" })} className={ROW_ACTION}>
          Add credits
        </button>
      </div>
    </PricingFrame>
  );
}
