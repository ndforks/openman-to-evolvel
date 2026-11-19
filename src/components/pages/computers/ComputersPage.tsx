"use client";

import { SlidersHorizontal } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { COMPUTER_PRESETS, type ComputerPreset } from "../data/computers";
import { BrandLogo, PageShell } from "../ui";
import { CloudComputerList } from "./CloudComputerList";
import { ComputerArt } from "./ComputerArt";
import { useComputers } from "./useComputers";

function PresetCard({ preset, onCreate }: { preset: ComputerPreset; onCreate: (preset: ComputerPreset) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCreate(preset)}
      aria-label={`${preset.title}: create a cloud computer`}
      className="group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[12px] bg-[var(--om-surface)] text-start shadow-[0_0_0_0.5px_var(--om-border-strong)] outline-none transition-shadow hover:shadow-[0_0_0_1px_var(--om-shadow-highlight),0_0_0_0.5px_var(--om-shadow-md),0_24px_24px_-12px_var(--om-shadow-sm),0_3px_3px_-1.5px_var(--om-shadow-md),0_10px_20px_1px_var(--om-shadow-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--om-btn-accent)]"
    >
      <ComputerArt preset={preset.id} />
      <span className="flex w-full min-w-0 flex-1 flex-col items-start gap-[2px] p-[16px]">
        <span className="min-w-0 text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">{preset.title}</span>
        <span className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{preset.description}</span>
        <span className="mt-auto flex w-full flex-wrap items-center gap-[4px] pt-[8px]">
          {preset.chips.map((chip) => (
            <span key={chip.label} className="inline-flex h-[20px] shrink-0 items-center gap-[4px] whitespace-nowrap rounded-[4px] bg-[var(--om-fill)] px-[4px] text-[var(--om-text-3)]">
              <BrandLogo src={chip.logo} w={chip.size} mono={chip.mono} className={chip.mono ? "text-[var(--om-text-1)]" : undefined} />
              <span className="text-[12px] leading-[16px]">{chip.label}</span>
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

/** The real computers in the Orgo workspace, with live status. Hidden while there are none and nothing to report. */
function YourComputers() {
  const { computers, loaded, notice } = useComputers();
  if (loaded && computers.length === 0 && !notice) return null;

  return (
    <section aria-labelledby="computers-yours" className="flex w-full flex-col gap-[16px] pb-[24px] pt-[12px]">
      <div className="flex min-h-[32px] items-center justify-between gap-x-[16px]">
        <h2 id="computers-yours" className="min-w-0 text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">
          Your cloud computers
        </h2>
        {loaded && computers.length > 0 ? <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Live from Orgo</span> : null}
      </div>
      {!loaded ? (
        <div aria-busy="true" aria-label="Loading your computers" className="h-[68px] animate-pulse rounded-[12px] bg-[var(--om-surface)] shadow-[0_0_0_0.5px_var(--om-border-strong)]" />
      ) : computers.length > 0 ? (
        <CloudComputerList computers={computers} />
      ) : null}
      {notice ? (
        <p role="status" className="-mt-[8px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

export function ComputersPage() {
  const open = useUI((s) => s.open);

  const create = (preset: ComputerPreset) => open("create-computer", { preset: preset.id, title: preset.title, os: preset.os });

  return (
    <PageShell title="Computers">
      <YourComputers />

      {/* Ready-made setups, or a custom size and OS. */}
      <section aria-labelledby="computers-cloud" className="flex w-full flex-col gap-[16px] pb-[24px] [&:first-child]:pt-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-x-[16px] gap-y-[8px]">
          <h2 id="computers-cloud" className="min-w-0 text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">
            Start from a ready-made setup
          </h2>
          <button
            type="button"
            onClick={() => open("customize-computer")}
            className="inline-flex h-[32px] min-w-[64px] shrink-0 cursor-pointer items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] px-[8px] text-[14px] font-medium leading-[18px] text-[var(--om-text-1)] outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] transition-colors hover:bg-[var(--om-fill-subtle)] hover:opacity-90 active:opacity-80 focus-visible:outline-[var(--om-border-focus)]"
          >
            <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
            <span className="pe-[2px]">Customize</span>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
          {COMPUTER_PRESETS.map((preset) => (
            <PresetCard key={preset.id} preset={preset} onCreate={create} />
          ))}
        </div>
      </section>

    </PageShell>
  );
}
