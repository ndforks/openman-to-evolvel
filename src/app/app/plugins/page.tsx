// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { PluginsPage } from "@/components/pages/plugins/PluginsPage";

export const metadata: Metadata = { title: "Plugins" };

export default function Page() {
  return <PluginsPage />;
}
