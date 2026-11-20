// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Reads the docs' Markdown from `content/docs/` on the server and fills in brand names and catalog prices.
 *
 * Markdown never hard-codes the product name or a price. It writes tokens instead:
 *   {{name}} {{agent}} {{domain}} {{mailDomain}} {{mode.max}} {{mode.standard}} {{mode.lite}}
 *   {{table:sizes}} {{table:plans}} {{table:os}} and the values in `values()` below,
 * so a brand swap (`src/config/brand.ts`) or an Orgo price change (`src/lib/orgo/plans.ts`) updates the docs too.
 *
 * Files are read synchronously: the read finishes inside the render, so the pages prerender like any static page.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "@/config/brand";
import {
  COMPUTER_SIZES,
  COMPUTERS_PER_ACCOUNT,
  CREDITS,
  MAC_MACHINE,
  OPERATING_SYSTEMS,
  PLAN_TIERS,
  PUBLIC_URLS_PER_COMPUTER,
  RATES,
  STORAGE_MAX_GB,
  YEARLY_DISCOUNT_PERCENT,
  formatUsd,
  planPrice,
} from "@/lib/orgo/plans";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

export interface DocHeading {
  depth: 2 | 3;
  text: string;
  id: string;
}

export interface LoadedDoc {
  markdown: string;
  headings: DocHeading[];
}

/** GitHub-style heading ids: lower case, punctuation dropped, spaces to hyphens. Shared with the renderer. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const usd = (cents: number) => formatUsd(cents / 100);

function values(): Record<string, string> {
  return {
    name: brand.name,
    agent: brand.agentNoun,
    domain: brand.host,
    mailDomain: brand.mailDomain ?? "your mail domain",
    "mode.max": brand.modes.max.label,
    "mode.standard": brand.modes.standard.label,
    "mode.lite": brand.modes.lite.label,
    "credits.starter": usd(CREDITS.starterCreditCents),
    "credits.topUpMin": usd(CREDITS.topUpMinCents),
    "credits.topUpMax": usd(CREDITS.topUpMaxCents),
    "credits.markup": `${CREDITS.modelMarkupPercent}%`,
    "storage.max": `${STORAGE_MAX_GB} GB`,
    "storage.block": `${formatUsd(RATES.diskBlockMonthly)} a month per ${RATES.diskBlockGb} GB`,
    "windows.monthly": formatUsd(RATES.windowsLicenseMonthly),
    "mac.monthly": formatUsd(MAC_MACHINE.monthlyUsd),
    "mac.spec": `${MAC_MACHINE.vcpu} vCPU, ${MAC_MACHINE.memoryGb} GB RAM, ${MAC_MACHINE.storageGb} GB storage`,
    "medium.hourly": formatUsd(COMPUTER_SIZES[0].hourlyUsd),
    "medium.monthly": formatUsd(COMPUTER_SIZES[0].monthlyUsd),
    "urls.perComputer": String(PUBLIC_URLS_PER_COMPUTER),
    "computers.plan": String(COMPUTERS_PER_ACCOUNT.plan),
    "computers.credit": String(COMPUTERS_PER_ACCOUNT.withCredit),
    "yearly.discount": `${YEARLY_DISCOUNT_PERCENT}%`,
  };
}

function sizesTable(): string {
  const rows = COMPUTER_SIZES.map(
    (size) => `| ${size.name} | ${size.vcpu} | ${size.memoryGb} GB | ${size.storageGb} GB | ${formatUsd(size.monthlyUsd)} | ${formatUsd(size.hourlyUsd)} |`,
  );
  return ["| Size | vCPU | Memory | Storage | Per month | Per hour (Linux) |", "|---|---|---|---|---|---|", ...rows].join("\n");
}

function plansTable(): string {
  const rows = PLAN_TIERS.map((tier) => {
    const yearly = planPrice(tier, "yearly");
    return `| ${tier.name} | ${formatUsd(tier.monthlyUsd)} | ${formatUsd(yearly.billedUsd)} | ${usd(tier.monthlyCreditCents)} | ${tier.vcpu} vCPU, ${tier.memoryGb} GB RAM |`;
  });
  return ["| Plan | Monthly | Yearly | Credit each month | Always-on capacity |", "|---|---|---|---|---|", ...rows].join("\n");
}

function osTable(): string {
  const rows = OPERATING_SYSTEMS.map((os) => {
    const price =
      os.id === "linux" ? "Size price" : os.id === "windows" ? `Size price + ${formatUsd(RATES.windowsLicenseMonthly)}/mo (included on Scale)` : `${formatUsd(MAC_MACHINE.monthlyUsd)}/mo, one fixed machine`;
    return `| ${os.label} | ${os.version} | ${price} |`;
  });
  return ["| Operating system | What runs | Price |", "|---|---|---|", ...rows].join("\n");
}

function fill(markdown: string): string {
  const table: Record<string, () => string> = { sizes: sizesTable, plans: plansTable, os: osTable };
  const vals = values();
  return markdown
    .replace(/\{\{table:([a-z]+)\}\}/g, (match, key: string) => table[key]?.() ?? match)
    .replace(/\{\{([a-zA-Z.]+)\}\}/g, (match, key: string) => vals[key] ?? match);
}

/** `##` and `###` headings outside code fences, in order. */
function headingsOf(markdown: string): DocHeading[] {
  const out: DocHeading[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].replace(/[`*_]/g, "");
    out.push({ depth: match[1].length as 2 | 3, text, id: slugify(text) });
  }
  return out;
}

/** The page's Markdown with tokens filled in, or null when the file does not exist. */
export function loadDoc(slug: string): LoadedDoc | null {
  // `""` (home), `page`, or `section/page`; a section's own page is `section/index.md`.
  if (!/^([a-z0-9-]+(\/[a-z0-9-]+)?)?$/.test(slug)) return null;
  const candidates = slug ? [`${slug}.md`, `${slug}/index.md`] : ["index.md"];
  let raw: string | null = null;
  for (const file of candidates) {
    try {
      raw = readFileSync(path.join(DOCS_DIR, file), "utf8");
      break;
    } catch {
      // Try the next spelling.
    }
  }
  if (raw === null) return null;
  // A leading `# Title` is dropped: the page renders its title from the manifest.
  const markdown = fill(raw).replace(/^\s*#\s+[^\n]*\n/, "");
  return { markdown, headings: headingsOf(markdown) };
}

/** A legal page from `content/legal/<name>.md`, tokens filled in, its `# Title` dropped. */
export function loadLegal(name: "terms" | "privacy"): string | null {
  try {
    const raw = readFileSync(path.join(process.cwd(), "content", "legal", `${name}.md`), "utf8");
    return fill(raw).replace(/^\s*#\s+[^\n]*\n/, "");
  } catch {
    return null;
  }
}
