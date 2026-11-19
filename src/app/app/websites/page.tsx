// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { WebsitesPage } from "@/components/pages/websites/WebsitesPage";

export const metadata: Metadata = { title: "Websites" };

export default function Page() {
  return <WebsitesPage />;
}
