// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { HomeScreen } from "@/components/shell/home/home-screen";

export const metadata: Metadata = { title: brand.name };

/** Home: start a new task. */
export default function Page() {
  return <HomeScreen />;
}
