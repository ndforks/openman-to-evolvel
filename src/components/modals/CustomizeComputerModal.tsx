// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * "Customize" cloud computer modal. One component, two entry points:
 *  - opened on its own: pick an operating system, then a plan, location and storage;
 *  - opened from a Create preset (`props.preset` in the UI store): the OS is fixed, the preset's preview
 *    replaces the OS picker and a back arrow returns to the Create modal.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatUsd } from "@/lib/orgo/plans";
import { useUI } from "@/lib/ui-store";
import { BrandLogo, ComputerIcon, CreateOverlay, FooterActions, PreviewCard, PriceBlock, SpecLine } from "./CreateComputerModal";
import {
  DEFAULT_LOCATION,
  NETWORK_FEATURES,
  OS_OPTIONS,
  PLANS_BY_OS,
  STORAGE_BLOCK_GB,
  clampStorage,
  computerPrice,
  findPreset,
  fractionToStorage,
  isConfigurable,
  planFeatures,
  resolveOs,
  resolvePlan,
  storageMin,
  storageOptions,
  storageTicks,
  storageToFraction,
  type ComputerOs,
  type ComputerPlan,
  type ComputerPlanId,
  type OsOption,
} from "./data/computers";
import { cn, ModalShell } from "./ModalShell";
import { useCreateComputer } from "./useCreateComputer";

/* ---------- OS picker illustrations ---------- */

/** Laptop-style screen that rises from the bottom of an OS card (130x84, 4px bezel). */
const DESK = "relative flex h-[84px] w-[130px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-t-[6px] border-x-4 border-t-4 border-[#141414] bg-origin-border";

/** Each OS: a flat two-colour screen with its mark in a white tile. */
const DESKS: Record<ComputerOs, { from: string; to: string; logo: string; mono?: boolean }> = {
  linux: { from: "#3B1E3A", to: "#C2543A", logo: "/brands/tux.svg" },
  windows: { from: "#0B1F5C", to: "#2E6BE6", logo: "/brands/windows-blue.svg" },
  macos: { from: "#5C5F66", to: "#B9BCC2", logo: "/brands/apple.svg", mono: true },
};

function OsDesk({ os }: { os: ComputerOs }) {
  const desk = DESKS[os];
  return (
    <div className={DESK} style={{ backgroundImage: `linear-gradient(150deg, ${desk.from} 0%, ${desk.to} 100%)` }}>
      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-white shadow-[0_3px_8px_#00000040]">
        <BrandLogo src={desk.logo} size={18} mono={desk.mono} className={desk.mono ? "text-[#1A1A1A]" : undefined} />
      </div>
    </div>
  );
}

/* ---------- cards ---------- */

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">{children}</div>;
}

function OsCard({ option, selected, onSelect }: { option: OsOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex h-[196px] min-w-0 flex-1 cursor-pointer flex-col overflow-hidden rounded-[14px] text-left outline-none transition-colors focus-visible:border-[var(--om-border-focus)]",
        selected ? "border-2 border-[var(--om-btn-accent)] focus-visible:border-[var(--om-btn-accent)]" : "border border-[var(--om-border-strong)] hover:border-[var(--om-border-focus)]",
      )}
    >
      <span aria-hidden="true" className="flex h-[110px] w-full shrink-0 items-end justify-center bg-[var(--om-bg-sidebar)]">
        <OsDesk os={option.id} />
      </span>
      <span className={cn("flex w-full flex-1 flex-col gap-[6px] px-[18px] py-[14px]", selected && "bg-[var(--om-fill-subtle)]")}>
        <span className="flex items-center gap-[8px]">
          <BrandLogo src={option.logo} size={option.logoSize} mono={option.mono} />
          <span className="text-[16px] font-semibold leading-[22px] text-[var(--om-text-1)]">{option.label}</span>
        </span>
        <span className="text-[14px] leading-[20px] text-[var(--om-text-3)]">{option.version}</span>
      </span>
    </button>
  );
}

function PlanCard({ plan, os, selected, onSelect, alone }: { plan: ComputerPlan; os: ComputerOs; selected: boolean; onSelect: () => void; alone: boolean }) {
  const price = computerPrice(os, plan);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 flex-1 cursor-pointer flex-col rounded-[14px] bg-[var(--om-surface)] text-left outline-none transition-colors focus-visible:border-[var(--om-border-focus)]",
        selected ? "border-2 border-[var(--om-btn-accent)] px-[18px] pb-[18px] pt-[20px] focus-visible:border-[var(--om-btn-accent)]" : "border border-[var(--om-border-strong)] px-[19px] pb-[19px] pt-[21px] hover:border-[var(--om-border-focus)]",
        // A lone plan keeps the width of one of three columns.
        alone && "max-w-[calc((100%-24px)/3)]",
      )}
    >
      <span className="flex w-full items-baseline justify-between border-b border-[var(--om-border-strong)] pb-[18px]">
        <span className="text-[16px] font-semibold leading-[22px] text-[var(--om-text-1)]">{plan.label}</span>
        <span className="flex flex-col items-end">
          <span className="flex items-baseline gap-[4px]">
            <span className="text-[22px] font-semibold leading-[28px] text-[var(--om-text-1)]">{formatUsd(price.monthly)}</span>
            <span className="text-[14px] leading-[20px] text-[var(--om-text-3)]">/ month</span>
          </span>
          {price.hourly !== null ? <span className="text-[12.5px] leading-[16px] text-[var(--om-text-3)]">or {formatUsd(price.hourly)} / hour</span> : null}
        </span>
      </span>
      <span className="flex w-full flex-col gap-[12px] pt-[16px]">
        {planFeatures(plan).map((feature) => (
          <SpecLine key={feature.label} feature={feature} iconSize={18} gapClassName="gap-[14px]" />
        ))}
      </span>
    </button>
  );
}

/* ---------- storage ---------- */

function StorageField({ plan, value, onChange }: { plan: ComputerPlan; value: number; onChange: (gb: number) => void }) {
  // While the field has focus it shows what was typed; on blur it snaps to the nearest size Orgo sells.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex h-[42px] w-[89px] shrink-0 cursor-text items-center justify-between rounded-[10px] border border-[var(--om-border-strong)] pl-[15px] pr-[10px] transition-colors focus-within:border-[var(--om-border-focus)]">
      <input
        aria-label="Storage in GB"
        inputMode="numeric"
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={() => {
          if (draft) onChange(clampStorage(plan, Number(draft)));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-[40px] min-w-0 bg-transparent text-[16px] leading-[22px] text-[var(--om-text-1)] outline-none"
      />
      <span className="text-[16px] leading-[22px] text-[var(--om-text-2)]">GB</span>
    </label>
  );
}

function StorageSlider({ plan, value, onChange }: { plan: ComputerPlan; value: number; onChange: (gb: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const options = storageOptions(plan);
  const min = storageMin(plan);
  const max = options[options.length - 1];
  const percent = `${storageToFraction(plan, value) * 100}%`;
  const ticks = storageTicks(plan);

  const setFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    onChange(fractionToStorage(plan, (clientX - rect.left) / rect.width));
  };

  const step = (by: number) => {
    const index = Math.max(0, options.indexOf(value));
    return options[Math.min(options.length - 1, Math.max(0, index + by))];
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: step(1),
      ArrowUp: step(1),
      ArrowLeft: step(-1),
      ArrowDown: step(-1),
      PageUp: step(3),
      PageDown: step(-3),
      Home: min,
      End: max,
    };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(next);
  };

  return (
    <div className="relative h-[64px] shrink-0 select-none">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Storage"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} GB`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromPointer(e.clientX);
        }}
        onKeyDown={onKeyDown}
        className="group absolute inset-x-0 top-[-2px] h-[25px] cursor-pointer touch-none outline-none"
      >
        <div className="absolute inset-x-0 top-[8px] h-[9px] rounded-[5px] bg-[var(--om-fill-strong)]" />
        <div className="absolute left-0 top-[8px] h-[9px] rounded-[5px] bg-[var(--om-icon-1)]" style={{ width: percent }} />
        <div className="absolute top-0 size-[25px] -translate-x-1/2 rounded-full border-2 border-[#4D4D4D] bg-white group-focus-visible:ring-2 group-focus-visible:ring-[var(--om-btn-accent)]" style={{ left: percent }} />
      </div>
      {ticks.map((gb, index) => {
        const first = index === 0;
        const last = index === ticks.length - 1;
        const at = `${storageToFraction(plan, gb) * 100}%`;
        return (
          <div key={gb} aria-hidden="true">
            <div className={cn("absolute top-[32px] h-[9px] w-px", value === gb ? "bg-[var(--om-icon-1)]" : "bg-[var(--om-border-strong)]")} style={{ left: last ? "calc(100% - 1px)" : at }} />
            <div
              className={cn("absolute top-[46px] whitespace-nowrap text-[13px] leading-[18px] text-[var(--om-text-disabled)]", last ? "right-0 text-right" : first ? "left-0" : "-translate-x-1/2 text-center")}
              style={last || first ? undefined : { left: at }}
            >
              {gb} GB
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- the modal ---------- */

export function CustomizeComputerModal({ os, plan }: { os?: string; plan?: string }) {
  // The Create modal passes its preset id along; captured once so the view cannot flip while the modal closes.
  const [origin] = useState(() => findPreset(useUI.getState().modal?.props?.preset));
  const open = useUI((s) => s.open);
  const close = useUI((s) => s.close);

  const [selectedOs, setSelectedOs] = useState<ComputerOs>(() => origin?.os ?? resolveOs(os).id);
  const [planId, setPlanId] = useState<ComputerPlanId>(() => resolvePlan(origin?.os ?? resolveOs(os).id, plan ?? origin?.plan).id);
  const [storageGb, setStorageGb] = useState<number>(() => resolvePlan(origin?.os ?? resolveOs(os).id, plan ?? origin?.plan).storageGb);
  const { status, message, computer, elapsed, create } = useCreateComputer();

  const osOption = resolveOs(selectedOs);
  const plans = PLANS_BY_OS[selectedOs];
  const currentPlan = resolvePlan(selectedOs, planId);
  const configurable = isConfigurable(selectedOs);
  const storage = configurable ? clampStorage(currentPlan, storageGb) : currentPlan.storageGb;
  const price = computerPrice(selectedOs, currentPlan, storage);

  const selectPlan = (next: ComputerPlan) => {
    setPlanId(next.id);
    // Keep a bigger disk the person already chose; never go below the new size's own.
    setStorageGb((current) => clampStorage(next, Math.max(current, next.storageGb)));
  };

  const selectOs = (next: ComputerOs) => {
    if (next === selectedOs) return;
    const nextPlan = resolvePlan(next, planId);
    setSelectedOs(next);
    setPlanId(nextPlan.id);
    setStorageGb(nextPlan.storageGb);
  };

  return (
    <ModalShell
      title="Customize"
      dismissOnOutside={status !== "loading"}
      closeClassName="right-[26px] top-[27px]"
      className="flex h-[860px] max-h-[calc(100vh-40px)] w-[926px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[22px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
    >
      <div className="flex h-[64px] shrink-0 items-center gap-[9px] px-[29px] pt-[14px]">
        {origin ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => open("create-computer", { preset: origin.id, selectTarget: useUI.getState().modal?.props?.selectTarget })}
            className="-ml-[3px] flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-1)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]"
          >
            <ComputerIcon name="chevron-left" size={18} />
          </button>
        ) : null}
        <div className="text-[20px] font-semibold leading-[28px] tracking-[-0.01em] text-[var(--om-text-1)]">Customize</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#4A4A4A_transparent] [scrollbar-width:thin]">
        <div className="flex flex-col px-[29px] pb-[40px] pt-[8px]">
          {origin ? (
            <div className="flex flex-col border-b border-[var(--om-border)] pb-[28px]">
              <PreviewCard screen={origin.screen} variant="customize" />
            </div>
          ) : (
            <div className="flex flex-col gap-[16px] border-b border-[var(--om-border)] pb-[28px]">
              <SectionTitle>Operating system</SectionTitle>
              <div role="radiogroup" aria-label="Operating system" className="flex gap-[12px]">
                {OS_OPTIONS.map((option) => (
                  <OsCard key={option.id} option={option} selected={option.id === selectedOs} onSelect={() => selectOs(option.id)} />
                ))}
              </div>
            </div>
          )}

          <div className={cn("flex flex-col gap-[20px] pt-[28px]", configurable && "border-b border-[var(--om-border)] pb-[28px]")}>
            <SectionTitle>Size</SectionTitle>
            <div role="radiogroup" aria-label={`${osOption.label} plan`} className="flex gap-[12px]">
              {plans.map((candidate) => (
                <PlanCard key={candidate.id} plan={candidate} os={selectedOs} selected={candidate.id === currentPlan.id} onSelect={() => selectPlan(candidate)} alone={plans.length === 1} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-[20px] gap-y-[8px]">
              <span className="text-[15px] leading-[20px] text-[var(--om-text-3)]">Every size comes with:</span>
              {NETWORK_FEATURES.map((feature) => (
                <SpecLine key={feature.label} feature={feature} />
              ))}
            </div>
          </div>

          {configurable ? (
            <div className="flex flex-col gap-[18px] pt-[28px]">
              <div className="flex items-center justify-between gap-[16px]">
                <div className="flex flex-col gap-[2px]">
                  <div className="text-[16px] leading-[22px] text-[var(--om-text-1)]">Storage</div>
                  <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
                    {currentPlan.storageGb} GB included. More in {STORAGE_BLOCK_GB} GB steps at $1 / month each.
                  </div>
                </div>
                <div className="flex items-center gap-[12px]">
                  <StorageField plan={currentPlan} value={storage} onChange={setStorageGb} />
                  <span className="text-[16px] leading-[22px] text-[var(--om-text-2)]">=</span>
                  <span className="w-[84px] shrink-0 whitespace-nowrap text-right text-[16px] leading-[22px] text-[var(--om-text-1)]">+{formatUsd(price.storageAddOn)} / mo</span>
                </div>
              </div>
              <StorageSlider plan={currentPlan} value={storage} onChange={setStorageGb} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-[100px] shrink-0 items-center justify-between gap-[16px] border-t border-[var(--om-border)] bg-[var(--om-surface)] px-[29px] py-[14px]">
        <PriceBlock price={price} os={selectedOs} />
        <FooterActions
          status={status}
          message={message}
          onCancel={close}
          onConfirm={() => {
            void create({ os: selectedOs, plan: currentPlan.id, storageGb: storage, location: DEFAULT_LOCATION, name: origin ? origin.title : `${osOption.label} computer` });
          }}
        />
      </div>

      <CreateOverlay status={status} message={message} computer={computer} elapsed={elapsed} />
    </ModalShell>
  );
}
