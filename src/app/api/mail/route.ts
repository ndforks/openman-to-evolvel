import { NextResponse, type NextRequest } from "next/server";
import { ensurePersonalInbox, mailOverview } from "@/lib/mail/service";
import { vendorReady } from "@/lib/mail/vendor";
import { NOT_SET_UP, requireVendor, route } from "@/lib/mail/http";

/** GET /api/mail: the agent's addresses, approved senders, limits, and whether email is set up on this server. */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const configured = vendorReady("agentmail");
    const overview = await mailOverview(session.userId, session.plan);
    return NextResponse.json({ configured, ...(configured ? {} : { notice: NOT_SET_UP.agentmail }), ...overview });
  });
}

/** POST /api/mail: create the personal agent address if the user has none. */
export function POST(req: NextRequest) {
  return route(req, async (session) => {
    const off = requireVendor("agentmail");
    if (off) return off;
    const mailbox = await ensurePersonalInbox(session.userId, { name: session.name, email: session.email });
    return NextResponse.json({ mailbox }, { status: 201 });
  });
}
