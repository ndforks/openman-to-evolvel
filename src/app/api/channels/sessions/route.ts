// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { homeComputerId } from "@/lib/connectors/server";
import { channelSessions } from "@/lib/channels/server";
import { json, withUser } from "@/lib/orgo/http";

/** GET /api/channels/sessions: conversations the agent had in Telegram, Slack and other chat apps (Hermes' session store). */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const computerId = await homeComputerId(session);
    if (!computerId) return json({ sessions: [] });
    return json({ sessions: await channelSessions(orgo, computerId) });
  });
}
