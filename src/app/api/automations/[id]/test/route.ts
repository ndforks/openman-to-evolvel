import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/automations/http";
import { testRun, toRunView } from "@/lib/automations/service";

/** POST /api/automations/[id]/test: run it now (works while paused; not retried, not counted toward auto-pause). */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const { id } = await params;
    const run = await testRun(session, id);
    return NextResponse.json({ run: toRunView(run) }, { status: 202 });
  });
}
