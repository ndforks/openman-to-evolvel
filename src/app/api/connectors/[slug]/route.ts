import type { NextRequest } from "next/server";
import { SLUG, appStatus, disconnectApp, homeComputerId } from "@/lib/connectors/server";
import { BadRequest, json, withUser } from "@/lib/orgo/http";

/** GET /api/connectors/{slug}: `{ connected }`, read live (the popup poller). */
export function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withUser(req, async ({ session, orgo }) => {
    const { slug } = await params;
    if (!SLUG.test(slug)) throw new BadRequest("Which app?");
    const computerId = await homeComputerId(session);
    if (!computerId) return json({ connected: false, configured: false });
    const status = await appStatus(orgo, computerId);
    return json({ connected: status[slug] === true, configured: true });
  });
}

/** DELETE /api/connectors/{slug}: signs the app out of the user's computer (Composio revokes it; Orgo refreshes the agent). */
export function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withUser(req, async ({ session, orgo }) => {
    const { slug } = await params;
    if (!SLUG.test(slug)) throw new BadRequest("Which app?");
    const computerId = await homeComputerId(session);
    if (!computerId) return json({ error: "Your agent's computer isn't set up yet." }, 409);
    await disconnectApp(orgo, computerId, slug);
    return json({ ok: true });
  });
}
