import type { NextRequest } from "next/server";
import { requireComputer, readForce } from "@/lib/channels/route-helpers";
import { linkSlack, unlinkSlack } from "@/lib/channels/server";
import { deleteChannelLink, saveChannelLink } from "@/lib/db/channels";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";

/** POST /api/channels/slack[?force=1] { botToken, appToken }: checks the tokens with Slack, puts them in Hermes, restarts it, reports Slack's state. */
export function POST(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const body = (await readJson(req)) as { botToken?: unknown; appToken?: unknown };
    const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
    const appToken = typeof body.appToken === "string" ? body.appToken.trim() : "";
    if (!botToken || !appToken) throw new BadRequest("Paste both tokens.");
    const computerId = await requireComputer(session);
    const linked = await linkSlack(orgo, computerId, botToken, appToken, readForce(req));
    await saveChannelLink({ userId: session.userId, channel: "slack", computerId, externalName: linked.name, externalId: linked.teamId, secretEnc: linked.secretEnc });
    return json({ ok: true, name: linked.name, state: linked.state, error: linked.error });
  });
}

/** DELETE /api/channels/slack[?force=1]: removes the Slack tokens from the agent (restarts it). */
export function DELETE(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const computerId = await requireComputer(session);
    await unlinkSlack(orgo, computerId, readForce(req));
    await deleteChannelLink(session.userId, "slack").catch(() => undefined);
    return json({ ok: true });
  });
}
