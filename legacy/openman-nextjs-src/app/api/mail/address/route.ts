// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { changePersonalAddress } from "@/lib/mail/service";
import { readBody, requireVendor, route } from "@/lib/mail/http";

const schema = z.object({ username: z.string().trim().min(1).max(64) });

/** PATCH /api/mail/address: change the personal address (once every 7 days). */
export function PATCH(req: NextRequest) {
  return route(req, async (session) => {
    const off = requireVendor("agentmail");
    if (off) return off;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ mailbox: await changePersonalAddress(session.userId, body.data.username) });
  });
}
