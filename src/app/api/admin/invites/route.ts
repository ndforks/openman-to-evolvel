import type { NextRequest } from "next/server";
import { z } from "zod";
import { BadRequest, errorResponse, json, readJson } from "@/lib/orgo/http";
import { requireSession } from "@/lib/session";
import { addInvite, inviteGateOn, listInvites, removeInvite, roleOf } from "@/lib/session/invites";
import { connection } from "next/server";

/**
 * The staging invite list, for its owner only (the first account that signed in to the empty staging database).
 *   GET    /api/admin/invites                         `{ invites }`
 *   POST   /api/admin/invites { email } | { orgoUserId }   adds a member
 *   DELETE /api/admin/invites?id=<id>                 removes a member (their session ends within a minute)
 * From a terminal, while signed in in the browser: copy the `om_session` cookie and
 *   curl -X POST -H 'Content-Type: application/json' -H "Origin: $APP" -b "om_session=..." -d '{"email":"a@b.c"}' $APP/api/admin/invites
 */
async function owner(): Promise<string> {
  await connection();
  const session = await requireSession();
  if (!inviteGateOn()) throw new BadRequest("The invite list is off on this server (INVITE_GATE is not 1).", 404);
  if ((await roleOf(session.userId, session.email)) !== "owner") throw new BadRequest("Only the owner can manage the invite list.", 403);
  return session.userId;
}

export async function GET(req: NextRequest) {
  try {
    await owner();
    return json({ invites: await listInvites() });
  } catch (err) {
    return errorResponse(err, req);
  }
}

const addSchema = z.union([z.object({ email: z.string().trim().toLowerCase().email().max(320) }), z.object({ orgoUserId: z.string().trim().regex(/^[A-Za-z0-9_-]{6,80}$/) })]);

export async function POST(req: NextRequest) {
  try {
    const by = await owner();
    const parsed = addSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Send { email } or { orgoUserId }.");
    try {
      return json({ invite: await addInvite(parsed.data, by) }, 201);
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "23505") throw new BadRequest("That person is already on the list.", 409);
      throw err;
    }
  } catch (err) {
    return errorResponse(err, req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await owner();
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequest("Which invite? Pass ?id=.");
    return (await removeInvite(id)) ? json({ ok: true }) : json({ error: "No such member (the owner cannot be removed)." }, 404);
  } catch (err) {
    return errorResponse(err, req);
  }
}
