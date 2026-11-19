// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { getAccount, upsertAccount } from "@/lib/db/accounts";
import { workspaceView } from "@/lib/orgo/account-view";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";
import { AdoptRefused, resetHomeComputer } from "@/lib/provision";
import { encodeSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session/cookie";

/**
 * GET /api/me/workspaces: the Orgo workspaces this sign-in can see and the one OpenMan works in.
 * `{ current, canSwitch, workspaces: [{ id, name, yours, role, ownerEmail, ownerPlan, computers, usable }] }`.
 * A workspace-scoped key sees only its own workspace (`canSwitch: false`).
 *
 * PUT /api/me/workspaces `{ workspaceId }`: OpenMan works in that workspace from now on (remembered on the account).
 * The agent computer belongs to a workspace, so when it changes the agent computer link is dropped (the computer
 * itself is not touched and keeps running where it is) and the first-run screen sets one up in the new workspace.
 * Answers `{ current, reset }`.
 */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const account = session.dev ? null : await getAccount(session.userId).catch(() => null);
    const list = await orgo.workspaces();
    const current = account?.workspaceId ?? session.workspaceId ?? orgo.workspaceId;
    const workspaces = list.map((w) => workspaceView(w, session.userId)).sort((a, b) => Number(b.yours) - Number(a.yours) || a.name.localeCompare(b.name));
    return json({ current, canSwitch: !session.dev && session.keyScope !== "workspace" && workspaces.filter((w) => w.usable).length > 1, workspaces });
  });
}

export function PUT(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    if (session.dev) throw new BadRequest("The development user's workspace comes from .env.local.", 409);
    if (session.keyScope === "workspace") throw new BadRequest("This sign-in uses a key limited to one workspace. Sign in with Orgo or an account key to switch.", 409);
    const body = (await readJson(req)) as { workspaceId?: unknown };
    if (typeof body?.workspaceId !== "string" || !body.workspaceId) throw new BadRequest("workspaceId is required.");
    const target = (await orgo.workspaces()).find((w) => w.id === body.workspaceId);
    if (!target) throw new BadRequest("That workspace isn't one of yours on Orgo.", 404);
    const view = workspaceView(target, session.userId);
    if (!view.usable) throw new BadRequest("You can only view that workspace, so OpenMan can't set up a computer there.", 403);
    const account = await getAccount(session.userId);
    let reset = false;
    if (account?.workspaceId !== target.id) {
      if (account?.homeComputerId) {
        try {
          await resetHomeComputer(session.userId);
        } catch (err) {
          if (err instanceof AdoptRefused) throw new BadRequest(err.message, err.status);
          throw err;
        }
        reset = true;
      }
      await upsertAccount({ userId: session.userId, workspaceId: target.id });
    }
    const res = json({ current: target.id, reset });
    res.cookies.set(SESSION_COOKIE, encodeSession({ ...session, workspaceId: target.id }), sessionCookieOptions);
    return res;
  });
}
