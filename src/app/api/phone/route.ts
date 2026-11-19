import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listNumbers } from "@/lib/db/phone";
import { vendorReady } from "@/lib/mail/vendor";
import { NOT_SET_UP, readBody, requireVendor, route } from "@/lib/mail/http";
import { PHONE_PRICING } from "@/lib/phone/agentphone";
import { provisionNumber, refreshSmsReadiness } from "@/lib/phone/service";

const schema = z.object({
  country: z.enum(["US", "CA"]).default("US"),
  areaCode: z.string().trim().max(3).optional(),
  approvedCallers: z.array(z.string().max(32)).max(10).optional(),
});

/**
 * GET /api/phone: the agent's number, whether phone is set up on this server, and the price of a number
 * (`pricing`, USD, AgentPhone's standard rates, paid from this server's AgentPhone balance, not the user's Orgo credits).
 * `outboundSms` on a number is refreshed from AgentPhone until it is `enabled`.
 */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const configured = vendorReady("agentphone");
    const numbers = await listNumbers(session.userId);
    return NextResponse.json({
      configured,
      ...(configured ? {} : { notice: NOT_SET_UP.agentphone }),
      pricing: PHONE_PRICING,
      numbers: configured ? await refreshSmsReadiness(session.userId, numbers) : numbers,
    });
  });
}

/** POST /api/phone: buy a number for the agent (US or Canada local; monthly cost on the provider). */
export function POST(req: NextRequest) {
  return route(req, async (session) => {
    const off = requireVendor("agentphone");
    if (off) return off;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const number = await provisionNumber(session.userId, { name: session.name }, body.data);
    return NextResponse.json({ number }, { status: 201 });
  });
}
