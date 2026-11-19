import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/shell";

/** Every marketing page (pricing, teams, features, legal, waitlist) shares the site header and footer. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingShell variant="site">{children}</MarketingShell>;
}
