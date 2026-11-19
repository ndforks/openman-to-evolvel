import { connection, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readJson, BadRequest } from "@/lib/orgo/http";
import { addInvite, removeInvite } from "@/lib/session/invites";
import { NotOperator, requireOperator } from "@/lib/observability/operator";
import { withErrorReporting } from "@/lib/observability/route";

/**
 * The invite list from `/app/admin`, for the owner (see `src/lib/observability/operator.ts`). Same table and rules as
 * `/api/admin/invites` (the staging route, which answers only while `INVITE_GATE=1`); this one also works for the
 * local dev owner so the page can be exercised on a laptop, where the gate is off and the list has no effect.
 *   POST   { email } | { orgoUserId }   adds a member
 *   DELETE ?id=<invite id>              removes a member (never the owner)
 */
async function owner(): Promise<string | Response> {
  await connection();
  try {
    const op = await requireOperator();
    if (!op.owner) return NextResponse.json({ error: "Only the owner can change the invite list." }, { status: 403 });
    return op.session.userId;
  } catch (err) {
    if (err instanceof NotOperator) return NextResponse.json({ error: "Not found." }, { status: 404 });
    throw err;
  }
}

const addSchema = z.union([z.object({ email: z.string().trim().toLowerCase().email().max(320) }), z.object({ orgoUserId: z.string().trim().regex(/^[A-Za-z0-9_-]{6,80}$/) })]);

export const POST = withErrorReporting("admin.members.add", async (req: NextRequest) => {
  const by = await owner();
  if (by instanceof Response) return by;
  let body: unknown;
  try {
    body = await readJson(req, 4096);
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Send { email } or { orgoUserId }." }, { status: 400 });
  try {
    const invite = await addInvite(parsed.data, by);
    return NextResponse.json({ invite: { id: invite.id, email: invite.email, role: invite.role, createdAt: invite.createdAt } }, { status: 201 });
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: string }).code === "23505") return NextResponse.json({ error: "That person is already on the list." }, { status: 409 });
    throw err;
  }
});

export const DELETE = withErrorReporting("admin.members.remove", async (req: NextRequest) => {
  const by = await owner();
  if (by instanceof Response) return by;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Which invite? Pass ?id=." }, { status: 400 });
  return (await removeInvite(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No such member (the owner cannot be removed)." }, { status: 404 });
});
