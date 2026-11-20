// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, requireVendor, route } from "@/lib/mail/http";
import { releaseNumber, setApprovedCallers } from "@/lib/phone/service";

const schema = z.object({ approvedCallers: z.array(z.string().max(32)).max(10) });

/** PATCH /api/phone/[id]: set the numbers allowed to text and call the agent. */
export function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ number: await setApprovedCallers(session.userId, id, body.data.approvedCallers) });
  });
}

/** DELETE /api/phone/[id]: release the number (irreversible). */
export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (session) => {
    const off = requireVendor("agentphone");
    if (off) return off;
    const { id } = await params;
    await releaseNumber(session.userId, id);
    return NextResponse.json({ ok: true });
  });
}
