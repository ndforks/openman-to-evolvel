// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: `Terms of service | ${brand.name}`,
  description: `The terms for using ${brand.name}, an Orgo product. Draft for legal review.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage name="terms" title="Terms of service" />;
}
