// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { SkillsPage } from "@/components/pages/skills/SkillsPage";

export const metadata: Metadata = { title: "Skills" };

export default function Page() {
  return <SkillsPage />;
}
