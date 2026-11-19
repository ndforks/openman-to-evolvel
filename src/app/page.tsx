import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { LandingHero } from "@/components/marketing/landing-hero";
import { MarketingShell } from "@/components/marketing/shell";

export const metadata: Metadata = {
  title: `${brand.name}: an open-source agent that works on its own computer`,
  description: `${brand.name} is an open-source AI agent that gets real work done on a cloud computer in your Orgo account. Follow along live, step in whenever you like, and pay for what it uses with Orgo credits.`,
};

/** Landing page. `/?signin=1` opens the sign-in modal on top of it. */
export default function LandingPage() {
  return (
    <MarketingShell variant="landing">
      <main className="w-full flex-1 bg-[var(--om-bg)]">
        <LandingHero />
      </main>
    </MarketingShell>
  );
}
