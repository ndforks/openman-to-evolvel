import type { NextRequest } from "next/server";
import { homeComputerId, refreshAgents } from "@/lib/connectors/server";
import { json, withUser } from "@/lib/orgo/http";

/**
 * POST /api/connectors/refresh: after a sign-in lands, Orgo re-points Hermes on the user's computer at the app tools
 * and restarts its gateway (Hermes lists MCP tools only when it starts). Call it once, not mid-run.
 */
export function POST(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const computerId = await homeComputerId(session);
    if (!computerId) return json({ error: "Your agent's computer isn't set up yet." }, 409);
    await refreshAgents(orgo, computerId);
    return json({ ok: true });
  });
}
