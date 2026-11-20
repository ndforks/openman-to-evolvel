// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Dark footer shared by every marketing page: a closing line, four link columns, copyright and the legal links. */
import Link from "next/link";
import { brand } from "@/config/brand";

interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

/** Every link leads to a real page or address. */
const columns: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Teams", href: "/team" },
      { label: "Websites", href: "/docs/websites" },
      { label: "Cloud computers", href: "/docs/cloud-computers" },
      { label: "Automations", href: "/docs/automations" },
      { label: "Skills", href: "/docs/skills" },
      { label: "Connectors", href: "/docs/connectors" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Get started", href: "/docs/getting-started" },
      { label: "Credits and billing", href: "/docs/credits-and-billing" },
      { label: "Developer API", href: "/docs/api" },
      { label: "Security and data", href: "/docs/security" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/?signin=1" },
      { label: "Orgo billing", href: "https://www.orgo.ai/settings/billing" },
      { label: "Orgo", href: "https://www.orgo.ai" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Contact", href: "mailto:contact@orgo.ai" },
    ],
  },
];

const linkClass = "block text-[14px] leading-[20px] text-[var(--om-text-on-accent-soft)] hover:underline";

export function SiteFooter() {
  return (
    <footer className="w-full shrink-0 self-stretch bg-[#1a1a19]">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-[48px] px-6 py-[100px]">
        <h2 className="font-serif text-[36px] italic leading-[44px] text-[var(--om-text-on-accent)]">
          Hand off the work,
          <br />
          keep the control.
        </h2>

        {/* A 7-column grid on wide screens; the last column (Company) sits at the right edge. */}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-7">
          {columns.map((column, index) => (
            <div key={column.title} className={`flex min-w-0 flex-col gap-[8px] ${index === columns.length - 1 ? "md:col-start-7" : ""}`}>
              <h3 className="text-[14px] font-medium leading-[20px] text-[var(--om-text-on-accent)]">{column.title}</h3>
              {column.links.map((link) =>
                !link.href.startsWith("/") ? (
                  <a key={link.label} href={link.href} className={linkClass} {...(link.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.label} href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-6 max-sm:flex-col max-sm:items-start">
          <div className="text-[14px] leading-[20px] text-[var(--om-text-on-accent-soft)]">© 2026 Organic Intelligence, Inc. {brand.name} is open source and runs on Orgo.</div>
          <div className="flex gap-[16px]">
            <Link href="/terms" className={linkClass}>
              Terms
            </Link>
            <Link href="/privacy" className={linkClass}>
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
