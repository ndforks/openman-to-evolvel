import { NextResponse, type NextRequest } from "next/server";
import { readBody } from "@/lib/agent/server/http";
import { baseOf, route } from "@/lib/automations/http";
import { editAutomation, removeAutomation, toView } from "@/lib/automations/service";
import { automationInputSchema } from "@/lib/automations/types";
import { getAutomation, latestRuns } from "@/lib/db/automations";

type Ctx = { params: Promise<{ id: string }> };

export function GET(req: NextRequest, { params }: Ctx) {
  return route(req, async (session) => {
    const { id } = await params;
    const a = await getAutomation(session.userId, id);
    if (!a) return NextResponse.json({ error: "Automation not found." }, { status: 404 });
    const last = await latestRuns(session.userId, [a.id]);
    return NextResponse.json({ automation: toView(a, baseOf(req), last.get(a.id)) });
  });
}

/** PATCH /api/automations/[id]: replace its settings (same body as create). */
export function PATCH(req: NextRequest, { params }: Ctx) {
  return route(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, automationInputSchema);
    if ("error" in body) return body.error;
    const a = await editAutomation(session, id, body.data);
    return NextResponse.json({ automation: toView(a, baseOf(req)) });
  });
}

export function DELETE(req: NextRequest, { params }: Ctx) {
  return route(req, async (session) => {
    const { id } = await params;
    const ok = await removeAutomation(session, id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Automation not found." }, { status: 404 });
  });
}
