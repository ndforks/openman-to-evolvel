import type { Metadata } from "next";
import { WebsitesPage } from "@/components/pages/websites/WebsitesPage";

export const metadata: Metadata = { title: "Websites" };

export default function Page() {
  return <WebsitesPage />;
}
