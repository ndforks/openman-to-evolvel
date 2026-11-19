// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { MeetingRecorder } from "@/components/voice/MeetingRecorder";

export const metadata: Metadata = { title: "Meeting recording" };

export default function Page() {
  return <MeetingRecorder />;
}
