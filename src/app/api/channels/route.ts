// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { channelsStatus } from "@/lib/channels/server";
import type { ChannelsStatus } from "@/lib/channels/types";
import { homeComputerId } from "@/lib/connectors/server";
import { listChannelLinks } from "@/lib/db/channels";
import { json, withUser } from "@/lib/orgo/http";

const OFF = { linked: false, state: "off" as const, error: null };

/** GET /api/channels: Telegram and Slack link status, read live from Hermes on the user's computer. */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const computerId = await homeComputerId(session);
    const empty: ChannelsStatus = { configured: false, activeRuns: 0, telegram: { ...OFF, bot: null }, slack: { ...OFF, name: null, pending: [], approved: 0 } };
    if (!computerId) return json(empty);
    const links = await listChannelLinks(session.userId).catch(() => []);
    const name = (c: string) => links.find((l) => l.channel === c)?.externalName ?? null;
    try {
      return json(await channelsStatus(orgo, computerId, { slack: name("slack"), telegram: name("telegram") }));
    } catch (err) {
      return json({ ...empty, configured: true, error: err instanceof Error ? err.message : "Your computer isn't answering." });
    }
  });
}
