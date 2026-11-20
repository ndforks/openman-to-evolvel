// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { ComputerUsePage } from "@/components/pages/computer-use/ComputerUsePage";

export const metadata: Metadata = { title: "Computer Use" };

export default function Page() {
  return <ComputerUsePage />;
}
