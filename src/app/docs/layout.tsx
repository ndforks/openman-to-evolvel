import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/shell";

/** The docs share the marketing header, banner, footer and sign-in modal. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return <MarketingShell variant="site">{children}</MarketingShell>;
}
