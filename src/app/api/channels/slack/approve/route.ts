import type { NextRequest } from "next/server";
import { requireComputer } from "@/lib/channels/route-helpers";
import { approveSlackRequest } from "@/lib/channels/server";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";

/** POST /api/channels/slack/approve { requestId, deny? }: lets (or does not let) someone who DM'd the bot talk to the agent. */
export function POST(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const body = (await readJson(req)) as { requestId?: unknown; deny?: unknown };
    if (typeof body.requestId !== "string") throw new BadRequest("Which request?");
    const r = await approveSlackRequest(orgo, await requireComputer(session), body.requestId, body.deny === true);
    if (!r) throw new BadRequest("That request expired. Ask them to message the bot again.", 410);
    return json({ ok: true, name: r.name });
  });
}
