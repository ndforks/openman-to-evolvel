import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { isEmail, listProjectMembers, normalizeEmail, projectAccess, removeProjectMember, upsertProjectMember } from "@/lib/db/project-members";

type Params = { params: Promise<{ id: string }> };
const notFound = () => jsonError("Project not found.", 404);

/** GET /api/projects/[id]/members: who the project is shared with (owner), or the caller's own role (others). */
export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    const members = access.role === "owner" ? await listProjectMembers(session.userId, id) : [];
    return NextResponse.json({ role: access.role, members }, { headers: { "Cache-Control": "no-store" } });
  });
}

const inviteSchema = z.object({ email: z.string().trim().min(3).max(320), role: z.enum(["editor", "member"]).default("member") });

/** POST /api/projects/[id]/members {email, role}: invite a signed-in user by email, or change their role. Owner only. */
export function POST(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, inviteSchema);
    if ("error" in body) return body.error;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    if (access.role !== "owner") return jsonError("Only the project's owner can invite people.", 403);
    const email = normalizeEmail(body.data.email);
    if (!isEmail(email)) return jsonError("Enter a valid email address.", 400);
    if (email === normalizeEmail(session.email ?? "")) return jsonError("You already own this project.", 400);
    try {
      const member = await upsertProjectMember(session.userId, id, email, body.data.role, normalizeEmail(session.email ?? "") || session.name || "owner");
      return NextResponse.json({ member }, { status: 201 });
    } catch (err) {
      return jsonError(err instanceof Error && /at most/.test(err.message) ? err.message : "Could not invite.", 400);
    }
  });
}

const removeSchema = z.object({ email: z.string().trim().min(3).max(320) });

/** DELETE /api/projects/[id]/members {email}: remove someone. Owner only (others leave with `POST .../leave`). */
export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, removeSchema);
    if ("error" in body) return body.error;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    if (access.role !== "owner") return jsonError("Only the project's owner can remove people.", 403);
    return (await removeProjectMember(session.userId, id, normalizeEmail(body.data.email))) ? NextResponse.json({ ok: true }) : jsonError("Not a member of this project.", 404);
  });
}
