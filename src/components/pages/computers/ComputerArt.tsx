// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Header art of the capability cards on the Computers page: a tinted panel with one large line icon per preset. */
import { AppWindow, Box, Code2, Gamepad2, Smartphone, Timer, type LucideIcon } from "lucide-react";
import type { ComputerPresetId } from "../data/computers";

const ART: Record<ComputerPresetId, { icon: LucideIcon; from: string; to: string; ink: string }> = {
  "run-automations": { icon: Timer, from: "#2a2440", to: "#3d2f5c", ink: "#c8b8ff" },
  "ios-mac-apps": { icon: Smartphone, from: "#10264d", to: "#1b4a8c", ink: "#9fd0ff" },
  "game-server": { icon: Gamepad2, from: "#0f2b1d", to: "#1d5a37", ink: "#8ef0b0" },
  "render-3d": { icon: Box, from: "#3a2312", to: "#6b3d18", ink: "#ffc58a" },
  "windows-apps": { icon: AppWindow, from: "#0c2a3d", to: "#115a7a", ink: "#8fe3ff" },
  "host-apps": { icon: Code2, from: "#2b2b2b", to: "#444444", ink: "#e6e6e6" },
};

export function ComputerArt({ preset }: { preset: ComputerPresetId }) {
  const { icon: Icon, from, to, ink } = ART[preset];
  return (
    <div aria-hidden className="flex h-[140px] w-full shrink-0 items-center justify-center bg-[var(--om-fill-sunken)] p-[12px]">
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[10px]"
        style={{ backgroundImage: `radial-gradient(circle at 70% 20%, ${ink}33 0%, transparent 55%), linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
      >
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: `radial-gradient(${ink} 1px, transparent 1px)`, backgroundSize: "12px 12px" }} />
        <span className="relative flex h-[60px] w-[60px] items-center justify-center rounded-[16px] border border-white/15 bg-black/20" style={{ color: ink }}>
          <Icon size={30} strokeWidth={1.6} />
        </span>
      </div>
    </div>
  );
}
