import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMail, setMailStatus } from "@/lib/db/mail";
import { addressOf } from "@/lib/mail/agentmail";
import { addApprovedSender } from "@/lib/mail/service";
import { jsonError, readBody, requireVendor, route } from "@/lib/mail/http";

const schema = z.object({ action: z.enum(["approve-sender", "dismiss"]) });

/** POST /api/mail/messages/[id]: review held mail. `approve-sender` adds its sender to the approved list. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const mail = await getMail(session.userId, id);
    if (!mail || mail.status !== "blocked") return jsonError("That email is not waiting for review.", 404);
    if (body.data.action === "dismiss") {
      await setMailStatus(session.userId, id, "ignored", "Dismissed.");
      return NextResponse.json({ ok: true });
    }
    const off = requireVendor("agentmail");
    if (off) return off;
    const senders = await addApprovedSender(session.userId, addressOf(mail.sender));
    await setMailStatus(session.userId, id, "ignored", "Sender approved. Ask them to send it again.");
    return NextResponse.json({ senders });
  });
}
