import type { NextRequest } from "next/server";
import { requireComputer, readForce } from "@/lib/channels/route-helpers";
import { pollTelegram, startTelegram, unlinkTelegram } from "@/lib/channels/server";
import { deleteChannelLink, saveChannelLink } from "@/lib/db/channels";
import { BadRequest, json, withUser } from "@/lib/orgo/http";

/** POST /api/channels/telegram[?replace=1]: start (or carry on) Orgo's one-scan Telegram pairing. Answers `{ status, link, handle }`. */
export function POST(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const computerId = await requireComputer(session);
    const answer = await startTelegram(orgo, computerId, req.nextUrl.searchParams.get("replace") === "1");
    if (answer.status === "connected") await saveChannelLink({ userId: session.userId, channel: "telegram", computerId, externalName: answer.bot ?? null, externalId: answer.bot ?? null }).catch(() => undefined);
    return json(answer);
  });
}

/** GET /api/channels/telegram?handle=: poll once. On `connected` the bot is on the computer and answering. */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const handle = req.nextUrl.searchParams.get("handle") ?? "";
    if (!handle || handle.length > 4000) throw new BadRequest("Which pairing?");
    const computerId = await requireComputer(session);
    const answer = await pollTelegram(orgo, computerId, handle);
    if (answer.status === "connected") await saveChannelLink({ userId: session.userId, channel: "telegram", computerId, externalName: answer.bot ?? null, externalId: answer.bot ?? null }).catch(() => undefined);
    return json(answer);
  });
}

/** DELETE /api/channels/telegram[?force=1]: removes the bot from the agent (restarts it). */
export function DELETE(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const computerId = await requireComputer(session);
    await unlinkTelegram(orgo, computerId, readForce(req));
    await deleteChannelLink(session.userId, "telegram").catch(() => undefined);
    return json({ ok: true });
  });
}
