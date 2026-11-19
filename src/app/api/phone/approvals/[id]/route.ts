import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, requireVendor, route } from "@/lib/mail/http";
import { decideSms } from "@/lib/phone/service";

const schema = z.object({ decision: z.enum(["approve", "deny"]) });

/** POST /api/phone/approvals/[id]: allow (sends it now) or deny one outbound text. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    if (body.data.decision === "approve") {
      const off = requireVendor("agentphone");
      if (off) return off;
    }
    const { id } = await params;
    return NextResponse.json({ message: await decideSms(session.userId, id, body.data.decision) });
  });
}
