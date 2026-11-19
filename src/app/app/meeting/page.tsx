import type { Metadata } from "next";
import { MeetingRecorder } from "@/components/voice/MeetingRecorder";

export const metadata: Metadata = { title: "Meeting recording" };

export default function Page() {
  return <MeetingRecorder />;
}
