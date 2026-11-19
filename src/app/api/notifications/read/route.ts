import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withSession } from "@/lib/agent/server/http";
import { markNotificationsRead } from "@/lib/db/notifications";

const schema = z.object({ ids: z.array(z.string().max(64)).max(500).optional() }).catch({});

/** POST /api/notifications/read `{ ids? }`: mark those read, or all of them without `ids`. Answers `{ updated }`. */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = schema.parse(await req.json().catch(() => ({})));
    return NextResponse.json({ updated: await markNotificationsRead(session.userId, body.ids) });
  });
}
