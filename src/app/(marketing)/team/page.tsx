/** Teams page. The header, promo banner and footer come from the marketing layout. */
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { Hero } from "@/components/marketing/team/hero";
import { Difference } from "@/components/marketing/team/difference";
import { HowItWorks } from "@/components/marketing/team/how-it-works";
import { EnterpriseReady } from "@/components/marketing/team/enterprise";
import { TeamPricing } from "@/components/marketing/team/team-pricing";
import { Faq } from "@/components/marketing/team/faq";

export const metadata: Metadata = {
  title: `${brand.name} for teams`,
  description: `${brand.name} for teams: everyone keeps their own Orgo account and computer, work is shared by link, and billing runs on Orgo plans and credits.`,
};

export default function TeamPage() {
  return (
    <main className="flex w-full flex-col items-center overflow-x-clip bg-[var(--om-bg)]">
      <Hero />
      <Difference />
      <HowItWorks />
      <EnterpriseReady />
      <TeamPricing />
      <Faq />
    </main>
  );
}
