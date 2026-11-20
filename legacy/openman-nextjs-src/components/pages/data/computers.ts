// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** The capability cards on the Computers page; each opens the create dialog with a matching preset. */

/** Preset names passed to `useUI().open("create-computer", { preset })`. */
export type ComputerPresetId = "run-automations" | "ios-mac-apps" | "game-server" | "render-3d" | "windows-apps" | "host-apps";

export interface ComputerChip {
  label: string;
  /** Path under `public/`. */
  logo: string;
  /** Logo box in px. */
  size: number;
  /** Paint the logo's silhouette in the text colour (single-colour marks). */
  mono?: boolean;
}

export interface ComputerPreset {
  id: ComputerPresetId;
  title: string;
  description: string;
  os: "linux" | "macos" | "windows";
  chips: ComputerChip[];
}

const LINUX: ComputerChip = { label: "Linux", logo: "/brands/tux.svg", size: 13 };
const SERVER: ComputerChip = { label: "Server", logo: "/brands/server.svg", size: 13 };

/** Capability cards, in display order (two rows of three). */
export const COMPUTER_PRESETS: ComputerPreset[] = [
  {
    id: "run-automations",
    title: "Always-on jobs",
    description: "Scheduled reports, uptime checks and bots that never sleep.",
    os: "linux",
    chips: [LINUX, SERVER],
  },
  {
    id: "ios-mac-apps",
    title: "Apple app builds",
    description: "Write, test and ship iPhone and Mac apps from a Mac in the cloud.",
    os: "macos",
    chips: [
      { label: "macOS", logo: "/brands/apple.svg", size: 12, mono: true },
      { label: "Xcode", logo: "/brands/xcode.svg", size: 13 },
    ],
  },
  {
    id: "game-server",
    title: "Game server",
    description: "A world for you and friends that keeps running after you log off.",
    os: "linux",
    chips: [LINUX, SERVER],
  },
  {
    id: "render-3d",
    title: "3D with Blender",
    description: "Model and render scenes in Blender without tying up your laptop.",
    os: "linux",
    chips: [LINUX, { label: "Blender", logo: "/brands/blender.svg", size: 13 }],
  },
  {
    id: "windows-apps",
    title: "Windows desktop",
    description: "Run Windows-only programs from any device, Mac included.",
    os: "windows",
    chips: [{ label: "Windows", logo: "/brands/windows-blue.svg", size: 12 }],
  },
  {
    id: "host-apps",
    title: "App hosting",
    description: "Develop a site or service and keep it online around the clock.",
    os: "linux",
    chips: [LINUX, SERVER],
  },
];
