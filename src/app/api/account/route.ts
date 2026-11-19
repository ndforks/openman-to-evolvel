// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { forgetConnection } from "@/lib/agent/server/connection";
import { jsonError, readBody, withSession, withStore } from "@/lib/agent/server/http";
import { getAccount, upsertAccount } from "@/lib/db/accounts";
import { deleteAllTasks, deleteUserRows } from "@/lib/personalization/account-data";
import { SESSION_COOKIE } from "@/lib/session/cookie";

const nameSchema = z.object({ name: z.string().trim().min(1, "Enter a name.").max(80) });

/** PATCH /api/account `{ name }`: the display name used in this app (Orgo's own profile is not changed). */
export function PATCH(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, nameSchema);
    if ("error" in body) return body.error;
    if (session.dev) return jsonError("The development user's name comes from the Orgo workspace.", 409);
    const existing = await getAccount(session.userId);
    if (!existing) return jsonError("Sign in again to edit your profile.", 409);
    const account = await upsertAccount({ userId: session.userId, name: body.data.name });
    return NextResponse.json({ name: account.name });
  });
}

const deleteSchema = z.object({ confirm: z.literal("DELETE") });

/**
 * DELETE /api/account `{ confirm: "DELETE" }`: stops and deletes every task, then removes every row this
 * app stores for the user, and signs this browser out. The Orgo account, its credits, its computers
 * (including the agent computer) and their files are not touched.
 */
export function DELETE(req: NextRequest) {
  return withStore(req, async (store, session) => {
    const body = await readBody(req, deleteSchema);
    if ("error" in body) return jsonError('Type DELETE to confirm.', 400);
    if (store.kind !== "supabase") return jsonError("The database is not connected, so there is nothing to delete.", 503);
    const tasks = await deleteAllTasks(store);
    const removed = await deleteUserRows(session.userId);
    forgetConnection(session.userId);
    const res = NextResponse.json({ ok: true, tasks, removed });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  });
}
