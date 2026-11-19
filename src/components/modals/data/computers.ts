/**
 * Presets, plans and options for the "New cloud computer" and "Customize" modals.
 * Every option and price is Orgo's, read from `@/lib/orgo/plans`.
 */
import {
  COMPUTER_SIZES,
  MAC_MACHINE,
  NETWORK_GBPS,
  ORGO_LOCATION,
  PUBLIC_URLS_PER_COMPUTER,
  RATES,
  STORAGE_MAX_GB,
  clampStorage as clampToSize,
  hasConfigurableStorage,
  hourlyUsd,
  monthlyUsd,
  plansForOs,
  sizeForPlan,
  storageAddOnUsd,
  storageSteps,
  type ComputerOs,
  type ComputerPlanId,
  type ComputerSize,
} from "@/lib/orgo/plans";

export type { ComputerOs, ComputerPlanId };
/** Ids the Computers page passes to `useUI().open("create-computer", { preset })`. */
export type ComputerPresetId = "run-automations" | "ios-mac-apps" | "game-server" | "render-3d" | "windows-apps" | "host-apps";
/** Which illustration the preview monitor shows. */
export type ComputerScreen = "automations" | "apple-apps" | "game-server" | "website" | "windows" | "render-3d";
/** Line icons used in spec lists and chips. */
export type ComputerGlyph = "performance" | "memory" | "cpu" | "storage" | "outbound" | "inbound" | "inbound-small" | "globe" | "license" | "cursor";

/* ---------- operating systems ---------- */

export interface OsOption {
  id: ComputerOs;
  /** Card title in the OS picker. */
  label: string;
  /** Version line under the title; also the heading in the create modal. */
  version: string;
  /** Path under `public/`. */
  logo: string;
  /** Logo box in px. */
  logoSize: number;
  /** Paint the logo's silhouette in the text colour (single-colour marks). */
  mono?: boolean;
}

export const OS_OPTIONS: OsOption[] = [
  { id: "linux", label: "Linux", version: "Ubuntu", logo: "/brands/tux.svg", logoSize: 18 },
  { id: "windows", label: "Windows", version: "Windows Server 2019", logo: "/brands/windows-blue.svg", logoSize: 17 },
  { id: "macos", label: "Mac", version: "macOS", logo: "/brands/apple.svg", logoSize: 17, mono: true },
];

export function resolveOs(os?: string): OsOption {
  return OS_OPTIONS.find((option) => option.id === os) ?? OS_OPTIONS[0];
}

/* ---------- plans (Orgo sizes) ---------- */

export interface ComputerPlan {
  id: ComputerPlanId;
  /** Orgo's size name: Medium, Large, XL, or the Mac model. */
  label: string;
  /** The Orgo size behind it; null for a Mac. */
  size: ComputerSize | null;
  memoryGb: number;
  vcpu: number;
  /** Disk the size comes with. */
  storageGb: number;
  /** The disk is part of the machine and cannot be chosen (Mac). */
  storageFixed: boolean;
}

function makePlan(os: ComputerOs, id: ComputerPlanId): ComputerPlan {
  if (os === "macos") return { id, label: MAC_MACHINE.name, size: null, memoryGb: MAC_MACHINE.memoryGb, vcpu: MAC_MACHINE.vcpu, storageGb: MAC_MACHINE.storageGb, storageFixed: true };
  const size = sizeForPlan(id);
  return { id, label: size.name, size, memoryGb: size.memoryGb, vcpu: size.vcpu, storageGb: size.storageGb, storageFixed: false };
}

export const PLANS_BY_OS: Record<ComputerOs, ComputerPlan[]> = {
  linux: plansForOs("linux").map((id) => makePlan("linux", id)),
  windows: plansForOs("windows").map((id) => makePlan("windows", id)),
  macos: plansForOs("macos").map((id) => makePlan("macos", id)),
};

/** The plan with this id for the OS, or the first one. */
export function resolvePlan(os: ComputerOs, plan?: string): ComputerPlan {
  const plans = PLANS_BY_OS[os];
  return plans.find((candidate) => candidate.id === plan) ?? plans[0];
}

/* ---------- prices ---------- */

export interface ComputerPrice {
  /** What Orgo charges per month for this computer, Windows licence included. */
  monthly: number;
  /** Linux by the hour from credit; null where Orgo sells it by the month only. */
  hourly: number | null;
  /** The Windows licence inside `monthly` (0 for Linux and Mac). */
  license: number;
  /** Storage past the size's own disk, inside `monthly`. */
  storageAddOn: number;
}

export function computerPrice(os: ComputerOs, plan: ComputerPlan, storageGb: number = plan.storageGb): ComputerPrice {
  if (!plan.size) return { monthly: MAC_MACHINE.monthlyUsd, hourly: null, license: 0, storageAddOn: 0 };
  const input = { os, size: plan.size, storageGb };
  return { monthly: monthlyUsd(input), hourly: hourlyUsd(input), license: os === "windows" ? RATES.windowsLicenseMonthly : 0, storageAddOn: storageAddOnUsd(plan.size, storageGb) };
}

/* ---------- feature rows ---------- */

export interface ComputerFeature {
  glyph: ComputerGlyph;
  label: string;
}

const memoryRow = (plan: ComputerPlan): ComputerFeature => ({ glyph: "memory", label: `${plan.memoryGb} GB RAM` });
const cpuRow = (plan: ComputerPlan): ComputerFeature => ({ glyph: "cpu", label: `${plan.vcpu} vCPU` });
const storageRow = (gb: number): ComputerFeature => ({ glyph: "storage", label: `${gb} GB storage` });
const NETWORK_ROW: ComputerFeature = { glyph: "inbound-small", label: `${NETWORK_GBPS} Gbps network` };
const URLS_ROW: ComputerFeature = { glyph: "globe", label: `${PUBLIC_URLS_PER_COMPUTER} public URLs` };

/** Rows inside a plan card in the Customize modal. */
export function planFeatures(plan: ComputerPlan): ComputerFeature[] {
  return [memoryRow(plan), cpuRow(plan), storageRow(plan.storageGb)];
}

/** "All plans include" in the Customize modal (Orgo, every plan: 1 Gbps, 5 public URLs a computer). */
export const NETWORK_FEATURES: ComputerFeature[] = [NETWORK_ROW, URLS_ROW];

/** Whether the OS offers a choice of storage size (not a Mac, whose disk is part of the machine). */
export function isConfigurable(os: ComputerOs): boolean {
  return hasConfigurableStorage(os);
}

/** Spec grid in the create modal, three per row. */
export function computerSpecs(os: ComputerOs, plan: ComputerPlan, storageGb: number): ComputerFeature[] {
  const rows: ComputerFeature[] = [memoryRow(plan), cpuRow(plan), storageRow(storageGb), NETWORK_ROW];
  if (os !== "macos") rows.push(URLS_ROW);
  if (os === "windows") rows.push({ glyph: "license", label: "Windows license" });
  return rows;
}

/* ---------- location ---------- */

/** Orgo places each computer itself, so the request carries this one value and the modals show no picker. */
export const DEFAULT_LOCATION = ORGO_LOCATION;

/* ---------- storage ---------- */

export const STORAGE_LIMIT_GB = STORAGE_MAX_GB;
export const STORAGE_BLOCK_GB = RATES.diskBlockGb;

/** The smallest disk this plan takes: the size's own. */
export function storageMin(plan: ComputerPlan): number {
  return plan.storageGb;
}

export function clampStorage(plan: ComputerPlan, gb: number): number {
  return plan.size ? clampToSize(plan.size, gb) : plan.storageGb;
}

/** Each allowed step: the size's own disk, then 20 GB blocks up to 300 GB. */
export function storageOptions(plan: ComputerPlan): number[] {
  return plan.size ? storageSteps(plan.size) : [plan.storageGb];
}

/** Tick labels under the slider. */
export function storageTicks(plan: ComputerPlan): number[] {
  const min = storageMin(plan);
  return [min, ...[100, 150, 200, 250, STORAGE_LIMIT_GB].filter((gb) => gb - min >= 40)];
}

/** GB -> position along the track, 0..1 (linear from the size's disk to 300 GB). */
export function storageToFraction(plan: ComputerPlan, gb: number): number {
  const min = storageMin(plan);
  if (STORAGE_LIMIT_GB <= min) return 1;
  return Math.min(1, Math.max(0, (gb - min) / (STORAGE_LIMIT_GB - min)));
}

/** Position along the track, 0..1 -> the nearest allowed GB. */
export function fractionToStorage(plan: ComputerPlan, fraction: number): number {
  const min = storageMin(plan);
  return clampStorage(plan, min + Math.min(1, Math.max(0, fraction)) * (STORAGE_LIMIT_GB - min));
}

/* ---------- presets ---------- */

export interface ComputerChip {
  label: string;
  /** Path under `public/` for a brand logo. */
  logo?: string;
  /** Logo box in px. */
  size?: number;
  mono?: boolean;
  /** Line icon for chips without a brand logo. */
  glyph?: ComputerGlyph;
}

export interface ComputerPreset {
  id: ComputerPresetId;
  title: string;
  description: string;
  os: ComputerOs;
  plan: ComputerPlanId;
  /** Derived from the plan so the two never disagree. */
  specs: { memoryGb: number; vcpu: number; storageGb: number };
  /** Orgo's price for it, per month. */
  price: number;
  location: string;
  screen: ComputerScreen;
  chips: ComputerChip[];
}

const LINUX_CHIP: ComputerChip = { label: "Linux", logo: "/brands/tux.svg", size: 17 };
const SERVER_CHIP: ComputerChip = { label: "Server", logo: "/brands/server.svg", size: 17 };
const COMPUTER_USE_CHIP: ComputerChip = { label: "Computer Use", glyph: "cursor" };
const BROWSER_CHIP: ComputerChip = { label: "Browser", glyph: "globe" };

function preset(input: Omit<ComputerPreset, "specs" | "price" | "location">): ComputerPreset {
  const plan = resolvePlan(input.os, input.plan);
  return {
    ...input,
    specs: { memoryGb: plan.memoryGb, vcpu: plan.vcpu, storageGb: plan.storageGb },
    price: computerPrice(input.os, plan).monthly,
    location: DEFAULT_LOCATION,
  };
}

/** Same order as the capability cards on the Computers page. Sizes: Medium, Mac mini M4, Large, XL, Windows Medium, Medium. */
export const COMPUTER_PRESETS: ComputerPreset[] = [
  preset({
    id: "run-automations",
    title: "Always-on automations",
    description: "A machine that never sleeps, for scheduled reports, monitors and bots.",
    os: "linux",
    plan: "standard",
    screen: "automations",
    chips: [LINUX_CHIP, SERVER_CHIP, COMPUTER_USE_CHIP, BROWSER_CHIP],
  }),
  preset({
    id: "ios-mac-apps",
    title: "Apple app development",
    description: "Xcode on a rented Mac: write, run and ship iPhone and Mac software.",
    os: "macos",
    plan: "standard",
    screen: "apple-apps",
    chips: [{ label: "macOS", logo: "/brands/apple.svg", size: 15, mono: true }, { label: "Xcode", logo: "/brands/xcode.svg", size: 17 }, COMPUTER_USE_CHIP, BROWSER_CHIP],
  }),
  preset({
    id: "game-server",
    title: "Game server",
    description: "Keep a multiplayer world up for your group, even after you log off.",
    os: "linux",
    plan: "advanced",
    screen: "game-server",
    chips: [LINUX_CHIP, SERVER_CHIP, COMPUTER_USE_CHIP, BROWSER_CHIP],
  }),
  preset({
    id: "render-3d",
    title: "3D modelling and rendering",
    description: "Blender on cloud CPUs, so long renders do not tie up your laptop.",
    os: "linux",
    plan: "performance",
    screen: "render-3d",
    chips: [LINUX_CHIP, { label: "Blender", logo: "/brands/blender.svg", size: 17 }, COMPUTER_USE_CHIP, BROWSER_CHIP],
  }),
  preset({
    id: "windows-apps",
    title: "Windows desktop",
    description: "Run Windows-only programs from any browser, on any device.",
    os: "windows",
    plan: "standard",
    screen: "windows",
    chips: [{ label: "Windows", logo: "/brands/windows-blue.svg", size: 16 }, COMPUTER_USE_CHIP, BROWSER_CHIP],
  }),
  preset({
    id: "host-apps",
    title: "App and website hosting",
    description: "Develop a site or service and keep it serving visitors day and night.",
    os: "linux",
    plan: "standard",
    screen: "website",
    chips: [LINUX_CHIP, SERVER_CHIP, COMPUTER_USE_CHIP, BROWSER_CHIP],
  }),
];

export function findPreset(id?: unknown): ComputerPreset | null {
  return typeof id === "string" ? (COMPUTER_PRESETS.find((candidate) => candidate.id === id) ?? null) : null;
}

/** The preset with this id, or the first one for unknown input. */
export function resolvePreset(id?: string): ComputerPreset {
  return findPreset(id) ?? COMPUTER_PRESETS[0];
}

/** Sizes in the order the catalog lists them (for any list that wants them all). */
export const ORGO_SIZES = COMPUTER_SIZES;
