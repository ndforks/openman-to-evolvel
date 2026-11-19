/**
 * The one catalog of what Orgo sells: operating systems, computer sizes, storage, prices, plans and credits.
 * Pure data and arithmetic with no server imports, read by the API routes, the Create / Customize modals,
 * the upgrade and team modals, the pricing page and the billing tab. Nothing else hard-codes a price.
 *
 * Every figure is copied from Orgo's own code (Orgo's web app source, read 2026-11-19). The file each
 * one comes from is named beside it. Orgo's code mirrors its Stripe prices, so these are the prices Orgo charges.
 * Only what Orgo sells self-serve is listed: nothing here is a placeholder for something Orgo lacks.
 */

/* ---------- operating systems ---------- */

export type ComputerOs = "linux" | "windows" | "macos";

export interface OsSpec {
  id: ComputerOs;
  label: string;
  /** What runs on it. Orgo publishes no Ubuntu release; Windows is Server 2019 (Orgo changelog, windows v0.1.0). */
  version: string;
}

export const OPERATING_SYSTEMS: readonly OsSpec[] = [
  { id: "linux", label: "Linux", version: "Ubuntu desktop" },
  { id: "windows", label: "Windows", version: "Windows Server 2019" },
  { id: "macos", label: "Mac", version: "macOS on Mac mini M4" },
];

/* ---------- component rates ---------- */

/** orgo-web `lib/compute-unit-pricing.ts` RATE_USD: US dollars per month. */
export const RATES = {
  ramGbMonthly: 2.5,
  /** Per half vCPU. */
  vcpuHalfMonthly: 2.5,
  /** Per 20 GB block of disk. */
  diskBlockMonthly: 1,
  diskBlockGb: 20,
  /** Per Windows computer, on every plan below Scale (included on Scale: `public/pricing.md`, Windows add-on). */
  windowsLicenseMonthly: 15,
  /** orgo-web `lib/compute-unit-pricing.ts` HOURLY_MARKUP and HOURS_PER_MONTH: Linux by the hour is the monthly bundle x 1.25 / 730. */
  hourlyMarkup: 1.25,
  hoursPerMonth: 730,
} as const;

/* ---------- sizes ---------- */

export type ComputerSizeId = "medium" | "large" | "xl";

export interface ComputerSize {
  id: ComputerSizeId;
  name: string;
  vcpu: number;
  memoryGb: number;
  /** Disk the size comes with. */
  storageGb: number;
  /** Price of the size with its own disk, per month (orgo-web `public/pricing.md`, "What a computer's worth costs"). */
  monthlyUsd: number;
  /** Linux running by the hour (orgo-web `public/pricing.md`, "By the hour"). */
  hourlyUsd: number;
}

/**
 * orgo-web `lib/computer-sizes.ts` APP_SIZES: the sizes Orgo's app offers (Medium and up; Small is API only, 2XL is set
 * up by request, `SELF_SERVE_MAX` is XL). Prices checked against `monthlyUsd()` and `hourlyUsd()` below.
 */
export const COMPUTER_SIZES: readonly ComputerSize[] = [
  { id: "medium", name: "Medium", vcpu: 2, memoryGb: 8, storageGb: 40, monthlyUsd: 32, hourlyUsd: 0.055 },
  { id: "large", name: "Large", vcpu: 4, memoryGb: 16, storageGb: 80, monthlyUsd: 64, hourlyUsd: 0.11 },
  { id: "xl", name: "XL", vcpu: 6, memoryGb: 32, storageGb: 150, monthlyUsd: 118, hourlyUsd: 0.202 },
];

export function sizeById(id: string): ComputerSize | undefined {
  return COMPUTER_SIZES.find((size) => size.id === id);
}

/** orgo-web `lib/compute-products.ts` ("mac-12"): a macOS VM on a Mac mini M4, a fixed machine sold by the month. */
export const MAC_MACHINE = {
  name: "Mac mini M4",
  vcpu: 8,
  /** `lib/computer-sizes.ts` MACOS_RAM_GB: the only RAM a macOS create accepts. */
  memoryGb: 10,
  storageGb: 200,
  monthlyUsd: 100,
  yearlyUsd: 1000,
} as const;

/* ---------- storage ---------- */

/** `lib/subscription-tiers.ts` PER_COMPUTER_HARD_CAP: 300 GB on one computer. Billed in 20 GB blocks at $1 a month. */
export const STORAGE_MAX_GB = 300;

/** The storage sizes a computer of this size can be created with: its own disk, then each 20 GB block up to 300 GB. */
export function storageSteps(size: ComputerSize): number[] {
  const steps = [size.storageGb];
  const firstBlock = Math.floor(size.storageGb / RATES.diskBlockGb) * RATES.diskBlockGb + RATES.diskBlockGb;
  for (let gb = firstBlock; gb <= STORAGE_MAX_GB; gb += RATES.diskBlockGb) steps.push(gb);
  return steps;
}

/** The nearest allowed storage for this size. */
export function clampStorage(size: ComputerSize, gb: number): number {
  const steps = storageSteps(size);
  return steps.reduce((best, step) => (Math.abs(step - gb) < Math.abs(best - gb) ? step : best), steps[0]);
}

/* ---------- prices ---------- */

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** orgo-web `lib/compute-unit-pricing.ts`: memory + vCPU + disk blocks, plus the Windows licence. US dollars per month. */
export function monthlyUsd(input: { os: ComputerOs; size: ComputerSize; storageGb: number }): number {
  if (input.os === "macos") return MAC_MACHINE.monthlyUsd;
  const { size } = input;
  const blocks = Math.ceil(input.storageGb / RATES.diskBlockGb);
  const linux = size.memoryGb * RATES.ramGbMonthly + (size.vcpu / 0.5) * RATES.vcpuHalfMonthly + blocks * RATES.diskBlockMonthly;
  return round(linux + (input.os === "windows" ? RATES.windowsLicenseMonthly : 0), 2);
}

/** What storage past the size's own disk adds per month. */
export function storageAddOnUsd(size: ComputerSize, storageGb: number): number {
  const extraBlocks = Math.max(0, Math.ceil(storageGb / RATES.diskBlockGb) - Math.ceil(size.storageGb / RATES.diskBlockGb));
  return extraBlocks * RATES.diskBlockMonthly;
}

/** `linuxHourlyMicros`: Linux running by the hour, rounded to $0.001. Orgo sells Windows and Mac by the month here. */
export function hourlyUsd(input: { os: ComputerOs; size: ComputerSize; storageGb: number }): number | null {
  if (input.os !== "linux") return null;
  return round((monthlyUsd(input) * RATES.hourlyMarkup) / RATES.hoursPerMonth, 3);
}

/** "$32", "$13.50", "$0.055". */
export function formatUsd(amount: number): string {
  if (Number.isInteger(amount)) return `$${amount.toLocaleString("en-US")}`;
  const max = amount < 1 ? 3 : 2;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: max })}`;
}

/* ---------- plans ---------- */

export type PlanTierId = "starter" | "growth" | "scale";

export interface PlanTier {
  id: PlanTierId;
  name: string;
  /** Orgo's key for the tier, as its billing page's `?upgrade=` reads it (`lib/subscription-tiers.ts` SELLABLE_UPGRADE_TIERS). */
  orgoTier: "hacker_v2" | "startup_v2" | "scale_v2";
  /** `lib/plan-pricing.ts` PLAN_PRICES. */
  monthlyUsd: number;
  /** `lib/plan-pricing.ts` PLAN_YEARLY_PRICES: 20% off twelve months. */
  yearlyUsd: number;
  /** One line under the price. */
  tagline: string;
  /** Mediums kept always on, from the plan's own vCPU and memory (`public/pricing.md`, Plans). */
  alwaysOnMediums: number;
  /** `lib/subscription-tiers.ts` tier table. */
  vcpu: number;
  memoryGb: number;
  /** Largest disk on one computer without a storage add-on. */
  maxStorageGb: number;
  /** Credit topped up each month, in cents (`TIER_STARTING_CREDITS`). */
  monthlyCreditCents: number;
  /**
   * People besides the owner (`lib/workspace-seats.ts` SEAT_CAPS and `public/pricing.md` "Team Members", checked
   * 2026-11-19): Starter 5, Growth 5, Scale 25. An older Starter listing said one member; Orgo no longer enforces that.
   */
  teammates: number;
  customDomains: number;
  residentialGb: number;
  windows: "add-on" | "included";
  customTemplates: boolean;
  liveCollaboration: boolean;
  support: string;
  featured?: boolean;
}

export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: "starter",
    name: "Starter",
    orgoTier: "hacker_v2",
    monthlyUsd: 29,
    yearlyUsd: 276,
    tagline: "For individuals",
    alwaysOnMediums: 1,
    vcpu: 2,
    memoryGb: 8,
    maxStorageGb: 40,
    monthlyCreditCents: 500,
    teammates: 5,
    customDomains: 0,
    residentialGb: 1,
    windows: "add-on",
    customTemplates: false,
    liveCollaboration: false,
    support: "Community support",
  },
  {
    id: "growth",
    name: "Growth",
    orgoTier: "startup_v2",
    monthlyUsd: 99,
    yearlyUsd: 948,
    tagline: "For teams",
    alwaysOnMediums: 4,
    vcpu: 8,
    memoryGb: 32,
    maxStorageGb: 80,
    monthlyCreditCents: 1000,
    teammates: 5,
    customDomains: 1,
    residentialGb: 5,
    windows: "add-on",
    customTemplates: false,
    liveCollaboration: true,
    support: "Priority support",
    featured: true,
  },
  {
    id: "scale",
    name: "Scale",
    orgoTier: "scale_v2",
    monthlyUsd: 399,
    yearlyUsd: 3828,
    tagline: "For agent apps",
    alwaysOnMediums: 16,
    vcpu: 36,
    memoryGb: 128,
    maxStorageGb: 150,
    monthlyCreditCents: 5000,
    teammates: 25,
    customDomains: 3,
    residentialGb: 20,
    windows: "included",
    customTemplates: true,
    liveCollaboration: true,
    support: "Advanced support",
  },
];

/** A plan by our id ("growth"), Orgo's tier key ("startup_v2") or its name ("Growth"). */
export function planTier(id: string): PlanTier | undefined {
  const wanted = id.trim().toLowerCase();
  return PLAN_TIERS.find((tier) => tier.id === wanted || tier.orgoTier === wanted || tier.name.toLowerCase() === wanted);
}

export type BillingPeriod = "monthly" | "yearly";

/** Yearly is shown as Orgo shows it: a whole-dollar monthly equivalent ($23, $79, $319) with the yearly total beside it. */
export function planPrice(tier: PlanTier, period: BillingPeriod): { perMonthUsd: number; billedUsd: number } {
  return period === "yearly" ? { perMonthUsd: Math.round(tier.yearlyUsd / 12), billedUsd: tier.yearlyUsd } : { perMonthUsd: tier.monthlyUsd, billedUsd: tier.monthlyUsd };
}

export type PlanFeatureIcon = "credits" | "computers" | "cpu" | "storage" | "os" | "team" | "domain" | "collab" | "templates" | "data" | "support";

export interface PlanFeatureLine {
  icon: PlanFeatureIcon;
  text: string;
  /** Longer explanation for a "?" tooltip. */
  help?: string;
}

const usd0 = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

/** What a plan includes, in Orgo's numbers (`public/pricing.md`, Feature Comparison). Every plan UI lists these. */
export function planFeatureLines(tier: PlanTier): PlanFeatureLine[] {
  const rows: PlanFeatureLine[] = [
    {
      icon: "credits",
      text: `${usd0(tier.monthlyCreditCents)} credit every month`,
      help: `Once a month Orgo tops your balance up to ${usd0(tier.monthlyCreditCents)} if it is lower. Credit pays for agent models (provider price plus 10%) and computers by the hour.`,
    },
    {
      icon: "computers",
      text: tier.alwaysOnMediums === 1 ? "1 Medium computer always on" : `${tier.alwaysOnMediums} Medium computers always on, or fewer up to XL`,
      help: "A Medium is 2 vCPU, 8 GB RAM and 40 GB storage. A Large takes the room of two Mediums, an XL of four.",
    },
    { icon: "cpu", text: `${tier.vcpu} vCPU and ${tier.memoryGb} GB RAM to share` },
    { icon: "storage", text: `Up to ${tier.maxStorageGb} GB storage per computer`, help: `More storage is $${RATES.diskBlockMonthly} a month per ${RATES.diskBlockGb} GB, up to ${STORAGE_MAX_GB} GB on one computer.` },
    { icon: "os", text: tier.windows === "included" ? "Linux and Windows computers" : `Linux; Windows $${RATES.windowsLicenseMonthly}/mo per computer` },
    { icon: "team", text: `${tier.teammates} teammates besides you` },
  ];
  if (tier.customDomains > 0) rows.push({ icon: "domain", text: tier.customDomains === 1 ? "1 custom domain" : `${tier.customDomains} custom domains` });
  if (tier.liveCollaboration) rows.push({ icon: "collab", text: "Live cursors and multiplayer chat" });
  if (tier.customTemplates) rows.push({ icon: "templates", text: "Build your own computer templates" });
  rows.push({ icon: "data", text: `${tier.residentialGb} GB residential IP data / month` });
  rows.push({ icon: "support", text: tier.support });
  return rows;
}

/** `lib/compute-unit-pricing.ts` YEARLY_DISCOUNT. */
export const YEARLY_DISCOUNT_PERCENT = 20;

/** Every plan, any size: up to 50 computers on the plan, past that by the hour from credit up to 999 (`lib/account-computer-cap.ts`). */
export const COMPUTERS_PER_ACCOUNT = { plan: 50, withCredit: 999 } as const;

/** Each computer gets up to 5 public HTTPS URLs on every plan (`lib/plan-copy.ts`). */
export const PUBLIC_URLS_PER_COMPUTER = 5;
/** `public/pricing.md`, Feature Comparison: Network. */
export const NETWORK_GBPS = 1;

/* ---------- credits ---------- */

export const CREDITS = {
  /** A credit is one US dollar of balance (`lib/credits-shared.ts`). Balances are whole cents. */
  centsPerCredit: 100,
  /** `TOPUP_MIN_CENTS`, `TOPUP_MAX_CENTS`: any whole dollar from $5 to $10,000. */
  topUpMinCents: 500,
  topUpMaxCents: 1_000_000,
  /** The amounts Orgo's own top-up offers first (`app/api/credits/checkout/route.ts`). */
  topUpSuggestedCents: [1000, 2500, 5000, 10000] as readonly number[],
  /** `MARKUP_MULTIPLIER`: model usage is the provider's list price plus 10%. */
  modelMarkupPercent: 10,
  /** `lib/free-limits/config.ts` STARTER_CREDIT_CENTS: a new account's starting credit. */
  starterCreditCents: 300,
} as const;

export function isValidTopUp(cents: number): boolean {
  return Number.isInteger(cents) && cents % 100 === 0 && cents >= CREDITS.topUpMinCents && cents <= CREDITS.topUpMaxCents;
}

/* ---------- create presets: plan id -> Orgo size ---------- */

/**
 * The three create choices per OS. The ids are the wire values `POST /api/computers` takes (`src/lib/orgo/computers.ts`);
 * each is one of Orgo's sizes. A Mac has one choice, the Mac mini M4.
 */
export type ComputerPlanId = "standard" | "advanced" | "performance";

const PLAN_SIZE: Record<ComputerPlanId, ComputerSizeId> = { standard: "medium", advanced: "large", performance: "xl" };

export function sizeForPlan(plan: ComputerPlanId): ComputerSize {
  return sizeById(PLAN_SIZE[plan]) ?? COMPUTER_SIZES[0];
}

/** The plan ids offered for an OS. */
export function plansForOs(os: ComputerOs): ComputerPlanId[] {
  return os === "macos" ? ["standard"] : ["standard", "advanced", "performance"];
}

export interface OrgoPlanMapping {
  size: ComputerSize | null;
  /** `ram` and `cpu` sent to `POST /api/computers`. Empty for a Mac, which sets its own. */
  request: { ram?: number; cpu?: number };
  /** Never set: every listed plan is one Orgo sells. Kept for the route's guard. */
  unavailable?: string;
}

export function planMapping(os: ComputerOs, plan: ComputerPlanId): OrgoPlanMapping | null {
  if (!plansForOs(os).includes(plan)) return null;
  if (os === "macos") return { size: null, request: {} };
  const size = sizeForPlan(plan);
  return { size, request: { ram: size.memoryGb, cpu: size.vcpu } };
}

/** Whether a disk size can be chosen (not on a Mac, whose disk is part of the machine). */
export function hasConfigurableStorage(os: ComputerOs): boolean {
  return os !== "macos";
}

export const ORGO_LIMITS = {
  maxVcpu: 6,
  maxMemoryGb: 32,
  maxStorageGb: STORAGE_MAX_GB,
  minStorageGb: COMPUTER_SIZES[0].storageGb,
  windowsMinMemoryGb: 8,
  mac: { memoryGb: MAC_MACHINE.memoryGb, vcpu: MAC_MACHINE.vcpu },
  /** A temporary computer is given an end a week out. */
  temporaryHours: 168,
} as const;

/* ---------- location ---------- */

/** Orgo takes no region on create and places each computer itself. The app sends this one value and shows no picker. */
export const ORGO_LOCATION = "auto";
export const NO_REGION_NOTE = "Orgo places each computer itself.";

export interface LocationOption {
  value: string;
  label: string;
  unavailable?: string;
}

export const LOCATION_OPTIONS: LocationOption[] = [{ value: ORGO_LOCATION, label: "Automatic" }];

/** Orgo sites seen so far, by the letters a host id starts with (`nyc-manual-6`, `lon2-manual-0`). */
const SITES: Record<string, string> = { nyc: "New York", lon: "London" };

/** Where a computer actually runs, read from its Orgo host. */
export function locationFromHost(hostId: unknown): string {
  const code = typeof hostId === "string" ? (/^[a-z]+/i.exec(hostId)?.[0] ?? "").toLowerCase() : "";
  if (!code) return "Site unknown";
  return SITES[code] ?? `Site ${code.toUpperCase()}`;
}

/* ---------- describing an existing computer ---------- */

/** The plan and size labels for a computer that exists, from its RAM and vCPU. */
export function describeSize(os: string, memoryGb: number, vcpu: number): { plan: string | null; size: string } {
  if (os === "macos") return { plan: MAC_MACHINE.name, size: "Mac" };
  const size = COMPUTER_SIZES.find((candidate) => candidate.memoryGb === memoryGb && candidate.vcpu === vcpu);
  const other: Record<string, string> = { "4/0.5": "Small", "64/8": "2XL" };
  return { plan: size?.name ?? null, size: size?.name ?? other[`${memoryGb}/${vcpu}`] ?? `${memoryGb} GB, ${vcpu} vCPU` };
}
