import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { revokeApiKey } from "@/lib/personalization/developers";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/account/api-keys/[id]: revoke a key; requests using it stop working at once. */
export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    return (await revokeApiKey(session.userId, id)) ? NextResponse.json({ ok: true }) : jsonError("API key not found.", 404);
  });
}
