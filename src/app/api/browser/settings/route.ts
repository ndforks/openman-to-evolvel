// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, withSession } from "@/lib/agent/server/http";
import { setPersist } from "@/lib/browser";
import { browserFailure, homeOf, noStore } from "@/lib/browser/route-helpers";

const schema = z.object({ persist: z.boolean() });

/** PUT /api/browser/settings { persist }: keep the agent browser's sign-ins across tasks (default) or start each task signed out. */
export function PUT(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema, 4096);
    if ("error" in body) return body.error;
    const home = await homeOf(session);
    if (home instanceof NextResponse) return home;
    try {
      return NextResponse.json(await setPersist(session.userId, home.orgo, home.computerId, body.data.persist), { headers: noStore });
    } catch (err) {
      return browserFailure(err);
    }
  });
}
