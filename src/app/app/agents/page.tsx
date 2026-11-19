// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { AgentsView } from "./AgentsView";

export const metadata: Metadata = { title: "Agents" };

export default function Page() {
  return <AgentsView />;
}
