import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { deleteWorkflow, updateWorkflow } from "@/lib/mail/service";
import { readBody, requireVendor, route } from "@/lib/mail/http";

const schema = z.object({ name: z.string().trim().min(1).max(80).optional(), prompt: z.string().max(4000).optional(), enabled: z.boolean().optional() });

/** PATCH /api/mail/workflows/[id]: rename, change the default prompt, or turn off. */
export function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ workflow: await updateWorkflow(session.userId, id, body.data) });
  });
}

/** DELETE /api/mail/workflows/[id]: delete the address (counts toward the daily limit). */
export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const off = requireVendor("agentmail");
    if (off) return off;
    const { id } = await params;
    await deleteWorkflow(session.userId, session.plan, id);
    return NextResponse.json({ ok: true });
  });
}
