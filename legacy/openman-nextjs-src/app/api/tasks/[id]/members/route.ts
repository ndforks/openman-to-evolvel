// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withTask } from "@/lib/agent/server/http";
import { addMember, isEmail, listMembers, normalizeEmail, removeMember } from "@/lib/agent/server/collab";

/** GET /api/tasks/[id]/members: who collaborates on this task (owner and collaborators may look). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(req, id, async ({ store, role }) => {
    if (store.kind !== "supabase") return NextResponse.json({ members: [], role });
    return NextResponse.json({ members: await listMembers(store.ownerId, id), role }, { headers: { "Cache-Control": "no-store" } });
  });
}

const schema = z.object({ email: z.string().trim().min(3).max(320) });

/** POST /api/tasks/[id]/members {email}: invite a signed-in user by email to read and prompt this task. Owner only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(
    req,
    id,
    async ({ store, session }) => {
      if (store.kind !== "supabase") return jsonError("Collaboration needs the database.", 503);
      const body = await readBody(req, schema);
      if ("error" in body) return body.error;
      const email = normalizeEmail(body.data.email);
      if (!isEmail(email)) return jsonError("Enter a valid email address.", 400);
      if (email === normalizeEmail(session.email ?? "")) return jsonError("You already own this task.", 400);
      try {
        // Recorded as the inviter's email (shown to the invitee as "shared by ..."), never the internal user id.
        const inviter = normalizeEmail(session.email ?? "") || session.name || "the owner";
        const member = await addMember(store.ownerId, id, email, inviter);
        return NextResponse.json({ member }, { status: 201 });
      } catch (err) {
        return jsonError(err instanceof Error ? err.message : "Could not invite.", 400);
      }
    },
    { ownerOnly: true },
  );
}

/** DELETE /api/tasks/[id]/members {email}: remove a collaborator. Owner only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(
    req,
    id,
    async ({ store }) => {
      const body = await readBody(req, schema);
      if ("error" in body) return body.error;
      const removed = store.kind === "supabase" && (await removeMember(store.ownerId, id, normalizeEmail(body.data.email)));
      return removed ? NextResponse.json({ ok: true }) : jsonError("Not a collaborator on this task.", 404);
    },
    { ownerOnly: true },
  );
}
