import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createWorkflow } from "@/lib/mail/service";
import { readBody, requireVendor, route } from "@/lib/mail/http";

const schema = z.object({ name: z.string().trim().min(1).max(80), username: z.string().trim().max(64).optional(), prompt: z.string().max(4000).default("") });

/** POST /api/mail/workflows: a new workflow address with a default prompt applied to every incoming mail. */
export function POST(req: NextRequest) {
  return route(req, async (session) => {
    const off = requireVendor("agentmail");
    if (off) return off;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ workflow: await createWorkflow(session.userId, session.plan, body.data) }, { status: 201 });
  });
}
