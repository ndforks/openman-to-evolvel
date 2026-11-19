import type { Metadata } from "next";
import { PersonalizationPage } from "@/components/pages/personalization/PersonalizationPage";

export const metadata: Metadata = { title: "Personalization" };

export default function Page() {
  return <PersonalizationPage />;
}
