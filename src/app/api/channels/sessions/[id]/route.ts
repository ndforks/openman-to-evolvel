// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { requireComputer } from "@/lib/channels/route-helpers";
import { channelSession } from "@/lib/channels/server";
import { json, withUser } from "@/lib/orgo/http";

/** GET /api/channels/sessions/{id}: one chat-app conversation, newest 200 messages, oldest first. */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async ({ session, orgo }) => {
    const { id } = await params;
    return json(await channelSession(orgo, await requireComputer(session), id));
  });
}
