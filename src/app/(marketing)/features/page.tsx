import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { FeaturesExplorer } from "@/components/marketing/features/features-explorer";

export const metadata: Metadata = {
  title: `Features | ${brand.name}`,
  description: `What ${brand.name} can do: build and host sites, run cloud computers, research, make files, automate jobs, and use skills and connected apps.`,
};

/** Features: searchable catalogue of everything the product does. Header, banner and footer come from the layout. */
export default function FeaturesPage() {
  return (
    <main className="w-full flex-1 bg-[var(--om-bg)] text-[var(--om-text-1)]">
      <FeaturesExplorer />
    </main>
  );
}
