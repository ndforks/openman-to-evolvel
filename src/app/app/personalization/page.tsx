// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { PersonalizationPage } from "@/components/pages/personalization/PersonalizationPage";

export const metadata: Metadata = { title: "Personalization" };

export default function Page() {
  return <PersonalizationPage />;
}
