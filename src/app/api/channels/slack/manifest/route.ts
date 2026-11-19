import type { NextRequest } from "next/server";
import { requireComputer } from "@/lib/channels/route-helpers";
import { slackManifest } from "@/lib/channels/server";
import { json, withUser } from "@/lib/orgo/http";

/** GET /api/channels/slack/manifest: Hermes' Slack app manifest for this agent, and a link that opens Slack's "Create app" with it filled in. */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => json(await slackManifest(orgo, await requireComputer(session))));
}
