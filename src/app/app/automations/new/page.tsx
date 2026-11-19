// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { Suspense } from "react";
import { AutomateYourWork } from "@/components/pages/automations/AutomateYourWork";

export const metadata: Metadata = { title: "New automation" };

export default function Page() {
  return (
    <Suspense>
      <AutomateYourWork />
    </Suspense>
  );
}
