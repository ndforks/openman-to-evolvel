// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { getAccount } from "@/lib/db/accounts";
import { orgoAccountView } from "@/lib/orgo/account-view";
import { json, withUser } from "@/lib/orgo/http";
import { OrgoError, planLabel } from "@/lib/orgo/user-client";
import { homeComputerId } from "@/lib/provision";

/**
 * GET /api/me: the signed-in person as Orgo knows them.
 * `{ user: { id, name, email, avatarUrl, plan, dev }, credits: { balanceCents }, homeComputer: { id, status } | null,
 *    orgo: { keyScope, via, workspace, billing, links } }`.
 * - `credits.balanceCents` is null when Orgo will not tell this key (a workspace-scoped key, the dev user).
 * - `orgo.workspace`: the workspace OpenMan works in (`{ id, name, yours, role, ownerEmail, ownerPlan, computers, usable }`).
 * - `orgo.billing`: who pays and whether setup can go ahead (`ready` false: no plan and no credit; see account-view.ts).
 * - `orgo.links`: orgo.ai pages to manage the account (profile, billing, credits, API keys, security).
 */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const account = session.dev ? null : await getAccount(session.userId).catch(() => null);
    const homeId = homeComputerId(session, account);
    const workspaceId = account?.workspaceId ?? session.workspaceId ?? orgo.workspaceId;
    const [view, home] = await Promise.all([
      orgoAccountView(session, orgo, workspaceId),
      homeId ? orgo.getComputer(homeId).catch((err) => (err instanceof OrgoError && err.status === 404 ? { id: homeId, status: "deleted" } : { id: homeId, status: "unknown" })) : Promise.resolve(null),
    ]);
    const plan = view.credits?.tier ? planLabel(view.credits.tier) : view.workspace?.yours && view.tier ? planLabel(view.tier) : session.plan;
    return json({
      user: { id: session.userId, name: account?.name || session.name, email: session.email, avatarUrl: session.avatarUrl ?? null, plan, dev: session.dev === true },
      credits: { balanceCents: view.credits?.balanceCents ?? null },
      homeComputer: home ? { id: home.id, status: home.status ?? "unknown" } : null,
      orgo: { keyScope: view.keyScope, via: view.via, workspace: view.workspace, billing: view.billing, links: view.links },
    });
  });
}
