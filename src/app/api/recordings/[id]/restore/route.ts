import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/recording/http";
import { restoreSteps } from "@/lib/recording/server";

/** POST /api/recordings/[id]/restore: put back steps deleted in review, from the raw recording. Notes are kept. */
export function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route("POST /api/recordings/[id]/restore", async (session) => ok({ recording: await restoreSteps(session, (await params).id) }));
}
