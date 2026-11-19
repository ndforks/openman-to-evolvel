import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addApprovedSender, removeApprovedSender } from "@/lib/mail/service";
import { listSenders } from "@/lib/db/mail";
import { jsonError, readBody, requireVendor, route } from "@/lib/mail/http";

const schema = z.object({ email: z.string().trim().min(3).max(320) });

/** GET /api/mail/senders: approved senders. */
export function GET(req: NextRequest) {
  return route(req, async (session) => NextResponse.json({ senders: await listSenders(session.userId) }));
}

/** POST /api/mail/senders: approve a sender (also added to every inbox's receive allow list). */
export function POST(req: NextRequest) {
  return route(req, async (session) => {
    const off = requireVendor("agentmail");
    if (off) return off;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ senders: await addApprovedSender(session.userId, body.data.email) }, { status: 201 });
  });
}

/** DELETE /api/mail/senders?email=: remove an approved sender. */
export function DELETE(req: NextRequest) {
  return route(req, async (session) => {
    const off = requireVendor("agentmail");
    if (off) return off;
    const email = req.nextUrl.searchParams.get("email");
    if (!email) return jsonError("Say which email to remove.", 400);
    return NextResponse.json({ senders: await removeApprovedSender(session.userId, email) });
  });
}
