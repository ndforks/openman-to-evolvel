// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillRecorder } from "@/components/computer/record/skill-recorder";

export const metadata: Metadata = { title: "Record a skill" };

export default function Page() {
  // The recorder reads `?id=` from the URL, which is only known at request time.
  return (
    <Suspense fallback={null}>
      <SkillRecorder />
    </Suspense>
  );
}
