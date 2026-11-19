// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: `Privacy policy | ${brand.name}`,
  description: `What ${brand.name} stores, where, and who processes it. Draft for legal review.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage name="privacy" title="Privacy policy" />;
}
