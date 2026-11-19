// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { ComputersPage } from "@/components/pages/computers/ComputersPage";

export const metadata: Metadata = { title: "Computers" };

export default function Page() {
  return <ComputersPage />;
}
