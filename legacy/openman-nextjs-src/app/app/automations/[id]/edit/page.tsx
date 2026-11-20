// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { Suspense } from "react";
import { EditAutomation } from "@/components/pages/automations/EditAutomation";

export const metadata: Metadata = { title: "Edit automation" };

/** /app/automations/[id]/edit: the id is known at request time only, so it is read inside Suspense (Cache Components). */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}>{params.then(({ id }) => <EditAutomation id={id} />)}</Suspense>;
}
