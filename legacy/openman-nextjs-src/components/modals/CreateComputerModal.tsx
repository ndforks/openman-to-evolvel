// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * "Create cloud computer" modal. One component, six presets (see `data/computers.ts`).
 * Also exports the pieces the Customize modal shares: icons, the preview monitor, the region select and the footer.
 */
import { type CSSProperties } from "react";
import {
  AppWindow,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Cpu,
  Gamepad2,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  MemoryStick,
  MousePointer2,
  Radio,
  RadioTower,
  SlidersHorizontal,
  Smartphone,
  Upload,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { describeComputer } from "@/components/pages/computers/useComputers";
import { formatUsd } from "@/lib/orgo/plans";
import type { CloudComputer } from "@/lib/orgo/types";
import {
  computerPrice,
  computerSpecs,
  resolveOs,
  resolvePlan,
  resolvePreset,
  type ComputerChip,
  type ComputerFeature,
  type ComputerGlyph,
  type ComputerOs,
  type ComputerPrice,
  type ComputerScreen,
} from "./data/computers";
import { cn, ModalShell } from "./ModalShell";
import { useCreateComputer, type CreateComputerStatus } from "./useCreateComputer";

/* ---------- icons ---------- */

export type ComputerIconName = ComputerGlyph | "help" | "sliders" | "chevron-down" | "chevron-left" | "check";

const ICONS: Record<ComputerIconName, { strokeWidth: number; glyph: LucideIcon }> = {
  performance: { strokeWidth: 1.7, glyph: Gauge },
  memory: { strokeWidth: 1.7, glyph: MemoryStick },
  cpu: { strokeWidth: 1.7, glyph: Cpu },
  storage: { strokeWidth: 1.7, glyph: HardDrive },
  outbound: { strokeWidth: 1.7, glyph: Upload },
  inbound: { strokeWidth: 1.7, glyph: RadioTower },
  "inbound-small": { strokeWidth: 1.7, glyph: Radio },
  globe: { strokeWidth: 1.7, glyph: Globe },
  license: { strokeWidth: 1.7, glyph: KeyRound },
  cursor: { strokeWidth: 1.8, glyph: MousePointer2 },
  help: { strokeWidth: 1.7, glyph: CircleHelp },
  sliders: { strokeWidth: 1.8, glyph: SlidersHorizontal },
  "chevron-down": { strokeWidth: 2, glyph: ChevronDown },
  "chevron-left": { strokeWidth: 2.2, glyph: ChevronLeft },
  check: { strokeWidth: 2.2, glyph: Check },
};

/** Line icon drawn in the current text colour. */
export function ComputerIcon({ name, size = 17, strokeWidth, className }: { name: ComputerIconName; size?: number; strokeWidth?: number; className?: string }) {
  const icon = ICONS[name];
  const Glyph = icon.glyph;
  return <Glyph size={size} strokeWidth={strokeWidth ?? icon.strokeWidth} aria-hidden="true" className={cn("shrink-0", className)} />;
}

/** A real brand mark from `public/brands`. `mono` paints the silhouette in the current text colour. */
export function BrandLogo({ src, size, mono, className }: { src: string; size: number; mono?: boolean; className?: string }) {
  if (mono) {
    const mask: CSSProperties = {
      width: size,
      height: size,
      backgroundColor: "currentColor",
      maskImage: `url(${src})`,
      WebkitMaskImage: `url(${src})`,
      maskSize: "contain",
      WebkitMaskSize: "contain",
      maskRepeat: "no-repeat",
      WebkitMaskRepeat: "no-repeat",
      maskPosition: "center",
      WebkitMaskPosition: "center",
    };
    return <span aria-hidden="true" className={cn("inline-block shrink-0 text-[var(--om-icon-1)]", className)} style={mask} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size }} />;
}

/* ---------- preview monitor ---------- */

/** Every screen illustration is drawn on a 161x90 canvas and scaled to the monitor it sits in. */
const SCREEN = "relative h-[90px] w-[161px] shrink-0 overflow-hidden rounded-[3px] border-[1.5px] border-[#3A3A3A] bg-origin-border";

/** Each preset's screen: a two-tone gradient with one large glyph (or the OS mark) and a caption. */
const SCREENS: Record<ComputerScreen, { from: string; to: string; caption: string; glyph?: LucideIcon; logo?: string }> = {
  automations: { from: "#1B1530", to: "#3B2F6B", caption: "Runs on a schedule", glyph: Workflow },
  "apple-apps": { from: "#0A1F4D", to: "#1F5FD1", caption: "Builds Apple apps", glyph: Smartphone },
  "game-server": { from: "#08251A", to: "#1A6B45", caption: "Always online", glyph: Gamepad2 },
  website: { from: "#2A2416", to: "#6B5A2A", caption: "Hosts your site", glyph: AppWindow },
  windows: { from: "#0A1830", to: "#1E4F8F", caption: "Windows desktop", logo: "/brands/windows-blue.svg" },
  "render-3d": { from: "#1F1F1F", to: "#4A4A4A", caption: "Renders 3D scenes", glyph: Box },
};

function ScreenArt({ screen }: { screen: ComputerScreen }) {
  const art = SCREENS[screen];
  const Glyph = art.glyph;
  return (
    <div className={cn(SCREEN, "flex flex-col items-center justify-center gap-[6px]")} style={{ backgroundImage: `linear-gradient(135deg, ${art.from} 0%, ${art.to} 100%)` }}>
      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#FFFFFF1F] text-white">
        {art.logo ? <BrandLogo src={art.logo} size={20} /> : Glyph ? <Glyph size={20} strokeWidth={1.8} aria-hidden="true" /> : null}
      </div>
      <div className="whitespace-pre text-[7px] font-medium leading-[9px] text-[#FFFFFFCC]">{art.caption}</div>
    </div>
  );
}

/** The preset's illustration on a desktop monitor with its stand. `variant` picks the Create (266x155) or Customize (289x150) card. */
export function PreviewCard({ screen, variant = "create" }: { screen: ComputerScreen; variant?: "create" | "customize" }) {
  const customize = variant === "customize";
  const width = customize ? 220 : 204;
  const height = customize ? 120 : 115;
  return (
    <div aria-hidden="true" className={cn("flex shrink-0 flex-col items-center justify-end overflow-hidden rounded-[14px]", customize ? "h-[150px] w-[289px] bg-[#1D1D1D]" : "h-[155px] w-[266px] bg-[#1C1C1C]")}>
      <div className="shrink-0 overflow-hidden rounded-[4px]" style={{ width, height }}>
        <div className="origin-top-left" style={{ width: 161, height: 90, transform: `scale(${width / 161}, ${height / 90})` }}>
          <ScreenArt screen={screen} />
        </div>
      </div>
      <div className="h-[5px] w-[10px] shrink-0 rounded-b-[5px] bg-[#D9D9D9]" />
      {customize ? <div className="h-[13px] w-[46px] shrink-0 bg-gradient-to-b from-[#2E2E2E] to-[#262626]" /> : <div className="h-[13px] w-[44px] shrink-0 bg-[#2C2C2C]" />}
      <div className={cn("h-[2px] shrink-0 rounded-[1px] bg-[#3A3A3A]", customize ? "w-[92px]" : "w-[66px]")} />
    </div>
  );
}

/* ---------- shared rows ---------- */

/** Icon + label line in a spec list. */
export function SpecLine({ feature, iconSize = 17, gapClassName = "gap-[6px]" }: { feature: ComputerFeature; iconSize?: number; gapClassName?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center", gapClassName)}>
      <ComputerIcon name={feature.glyph} size={iconSize} className="text-[var(--om-icon-2)]" />
      <span className="truncate text-[15px] leading-[20px] text-[var(--om-text-1)]">{feature.label}</span>
    </div>
  );
}

function Chip({ chip }: { chip: ComputerChip }) {
  return (
    <div className="flex h-[27px] shrink-0 items-center gap-[7px] rounded-[7px] bg-[var(--om-fill)] px-[9px]">
      {chip.logo ? <BrandLogo src={chip.logo} size={chip.size ?? 17} mono={chip.mono} /> : <ComputerIcon name={chip.glyph ?? "globe"} size={14} strokeWidth={1.8} className="text-[var(--om-icon-2)]" />}
      <span className="text-[14px] leading-[20px] text-[var(--om-text-2)]">{chip.label}</span>
    </div>
  );
}

/** Orgo's price for the computer: per month, and by the hour where Orgo sells Linux that way. */
export function PriceBlock({ price, os }: { price: ComputerPrice; os: ComputerOs }) {
  const note =
    os === "macos"
      ? "Billed monthly by Orgo. A Mac is kept for at least one month."
      : os === "windows"
        ? `Billed monthly on your Orgo plan, including the ${formatUsd(price.license)}/mo Windows license (included on Scale).`
        : "Billed monthly on your Orgo plan, prorated today. Included when your plan has room for it.";
  return (
    <div className="flex min-w-0 flex-col gap-[4px]">
      <div className="flex items-baseline gap-[4px]">
        <span className="text-[27px] font-semibold leading-[32px] tracking-[-0.01em] text-[var(--om-text-1)]">{formatUsd(price.monthly)}</span>
        <span className="text-[16px] leading-[22px] text-[var(--om-text-2)]">/ month</span>
        {price.hourly !== null ? <span className="pl-[6px] text-[14px] leading-[20px] text-[var(--om-text-3)]">or {formatUsd(price.hourly)} / hour from credits</span> : null}
      </div>
      <span className="max-w-[440px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{note}</span>
    </div>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="size-[15px] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />;
}

/**
 * Cancel + Subscribe with the inline error above them.
 * `floating` lifts the error out of the layout so the footer keeps its height (Create modal).
 */
export function FooterActions({ status, message, onCancel, onConfirm, floating }: { status: CreateComputerStatus; message: string | null; onCancel: () => void; onConfirm: () => void; floating?: boolean }) {
  const loading = status === "loading";
  const busy = loading || status === "success";
  return (
    <div className="relative flex shrink-0 flex-col items-end gap-[8px]">
      {status === "error" && message ? (
        <p role="alert" className={cn("text-right text-[13px] leading-[18px] text-[var(--om-danger)]", floating ? "absolute bottom-full right-0 mb-[8px] w-[390px]" : "max-w-[390px]")}>
          {message}
        </p>
      ) : null}
      <div className="flex gap-[9px]">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-[40px] cursor-pointer items-center rounded-[10px] border border-[var(--om-border-strong)] px-[15px] text-[15px] font-medium leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-busy={loading}
          className="flex h-[40px] cursor-pointer items-center gap-[8px] rounded-[10px] bg-[var(--om-btn-primary)] px-[13px] text-[15px] font-medium leading-[20px] text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)] disabled:cursor-default disabled:opacity-60"
        >
          {loading ? <Spinner /> : null}
          Subscribe
        </button>
      </div>
    </div>
  );
}

function ProgressStep({ label, state }: { label: string; state: "done" | "active" | "waiting" }) {
  return (
    <li className={cn("flex items-center gap-[10px] text-[14px] leading-[20px]", state === "waiting" ? "text-[var(--om-text-disabled)]" : "text-[var(--om-text-2)]")}>
      <span className="flex size-[16px] shrink-0 items-center justify-center">
        {state === "done" ? (
          <ComputerIcon name="check" size={15} className="text-[var(--om-success)]" />
        ) : state === "active" ? (
          <span aria-hidden="true" className="size-[13px] animate-spin rounded-full border-2 border-[var(--om-icon-2)] border-t-transparent" />
        ) : (
          <span aria-hidden="true" className="size-[5px] rounded-full bg-[var(--om-text-disabled)]" />
        )}
      </span>
      {label}
    </li>
  );
}

/**
 * Covers the modal from the moment the request is sent until the computer is running:
 * what is happening now, three steps, and the real computer's details once Orgo has made it.
 * The hook closes the modal shortly after the last step.
 */
export function CreateOverlay({ status, message, computer, elapsed }: { status: CreateComputerStatus; message: string | null; computer: CloudComputer | null; elapsed: number }) {
  if (status !== "loading" && status !== "success") return null;
  const done = status === "success";
  const running = computer?.status === "running";
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-[14px] rounded-[inherit] bg-[var(--om-surface)] px-[32px] text-center">
      {done ? (
        <span className="flex size-[52px] items-center justify-center rounded-full bg-[var(--om-success-soft)] text-[var(--om-success)]">
          <ComputerIcon name="check" size={26} />
        </span>
      ) : (
        <span className="flex size-[52px] items-center justify-center rounded-full bg-[var(--om-fill)]">
          <span aria-hidden="true" className="size-[24px] animate-spin rounded-full border-[2.5px] border-[var(--om-icon-1)] border-t-transparent" />
        </span>
      )}
      <p className="text-[18px] font-semibold leading-[26px] tracking-[-0.01em] text-[var(--om-text-1)]">{message ?? "Setting up your computer"}</p>
      <ul className="flex flex-col gap-[6px] text-left">
        <ProgressStep label="Request sent to Orgo" state="done" />
        <ProgressStep label="Computer created" state={computer ? "done" : "active"} />
        <ProgressStep label={running ? "Running" : "Starting up"} state={running ? "done" : computer ? "active" : "waiting"} />
      </ul>
      <p className="text-[14px] leading-[20px] text-[var(--om-text-3)]">
        {computer ? describeComputer(computer) : "Orgo is starting a fresh machine for you. It normally takes a few seconds."}
        {done ? null : <span className="tabular-nums"> · {elapsed}s</span>}
      </p>
      {done ? <p className="text-[14px] leading-[20px] text-[var(--om-text-3)]">You can find it on the Computers page.</p> : null}
    </div>
  );
}

/* ---------- the modal ---------- */

export function CreateComputerModal({ preset }: { preset?: string }) {
  const data = resolvePreset(preset);
  const os = resolveOs(data.os);
  const plan = resolvePlan(data.os, data.plan);

  const open = useUI((s) => s.open);
  const close = useUI((s) => s.close);
  const { status, message, computer, elapsed, create } = useCreateComputer();

  const specs = computerSpecs(data.os, plan, data.specs.storageGb);
  const price = computerPrice(data.os, plan, data.specs.storageGb);

  return (
    <ModalShell
      title="New cloud computer"
      dismissOnOutside={status !== "loading"}
      closeClassName="right-[25px] top-[26px]"
      className="flex max-h-[calc(100vh-32px)] w-[892px] max-w-[calc(100vw-32px)] flex-col overflow-y-auto rounded-[22px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] px-[28px] pb-[28px] pt-[24px] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center justify-between">
        <div className="text-[20px] font-semibold leading-[28px] tracking-[-0.01em] text-[var(--om-text-1)]">New cloud computer</div>
      </div>

      <div className="flex gap-[27px] border-b border-[var(--om-border)] pb-[26px] pt-[20px]">
        <PreviewCard screen={data.screen} />
        <div className="flex min-w-0 flex-1 flex-col gap-[4px] pt-[2px]">
          <div className="text-[20px] font-semibold leading-[28px] tracking-[-0.01em] text-[var(--om-text-1)]">{data.title}</div>
          <div className="text-[15px] leading-[22px] text-[var(--om-text-2)]">{data.description}</div>
          <div className="flex flex-wrap gap-[5px] pt-[10px]">
            {data.chips.map((chip) => (
              <Chip key={chip.label} chip={chip} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[20px] pt-[28px]">
        <div className="flex items-center justify-between gap-[16px]">
          <div className="flex min-w-0 items-center gap-[6px] text-[16px] leading-[22px]">
            <span className="font-medium text-[var(--om-text-1)]">{os.version}</span>
            <span className="text-[var(--om-text-3)]">·</span>
            <span className="text-[var(--om-text-2)]">{plan.label}</span>
            <span className="h-[22px] rounded-[5px] bg-[var(--om-fill-accent)] px-[5px] text-[15px] leading-[22px] text-[var(--om-text-accent)]">Recommended</span>
          </div>
          <button
            type="button"
            // `selectTarget` (set by the composer's run-target menu) rides along so the new computer still becomes the target.
            onClick={() => open("customize-computer", { os: data.os, plan: data.plan, preset: data.id, selectTarget: useUI.getState().modal?.props?.selectTarget })}
            className="flex h-[31px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[9px] border border-[var(--om-border-strong)] px-[10px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]"
          >
            <ComputerIcon name="sliders" size={16} />
            Customize
          </button>
        </div>
        <div className="grid grid-cols-[283px_283px_minmax(0,1fr)] gap-y-[14px]">
          {specs.map((feature) => (
            <SpecLine key={feature.label} feature={feature} />
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between gap-[16px] pt-[44px]">
        <PriceBlock price={price} os={data.os} />
        <FooterActions
          floating
          status={status}
          message={message}
          onCancel={close}
          onConfirm={() => {
            void create({ os: data.os, plan: data.plan, storageGb: data.specs.storageGb, location: data.location, name: data.title });
          }}
        />
      </div>

      <CreateOverlay status={status} message={message} computer={computer} elapsed={elapsed} />
    </ModalShell>
  );
}
