// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { getAccount } from "@/lib/db/accounts";
import { newComputerQuote, orgoAccountView } from "@/lib/orgo/account-view";
import { json, withUser } from "@/lib/orgo/http";
import { computersInUse } from "@/lib/provision";
import { rankCandidates } from "@/lib/provision/candidates";

/**
 * GET /api/me/computers: what the first-run screen offers before anything is created.
 * `{ workspace, current, candidates: [{ id, name, os, status, cpu, ramGb, diskGb, kind, suitable, note }],
 *    newComputer: { size, vcpu, memoryGb, billedAs, hourlyUsd, alwaysOnMonthlyUsd, monthlyUsd, planIncludesMediums },
 *    billing: { plan, paid, balanceCents, payer, ready, lowCredit, note }, links }`.
 * Read only: lists the workspace's computers (`GET /api/workspaces/{id}`); never changes or wakes one. A computer that
 * already runs another OpenMan sign-in's agent (or the dev setup's) is listed as not usable, so it is never clobbered.
 */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const account = session.dev ? null : await getAccount(session.userId).catch(() => null);
    const workspaceId = account?.workspaceId ?? session.workspaceId ?? orgo.workspaceId;
    const [view, computers] = await Promise.all([orgoAccountView(session, orgo, workspaceId), workspaceId ? orgo.listComputers(workspaceId) : Promise.resolve([])]);
    const inUse = session.dev ? new Map<string, string>() : await computersInUse(session.userId, computers.map((c) => c.id)).catch(() => new Map<string, string>());
    return json({
      workspace: view.workspace,
      current: session.dev ? process.env.ORGO_COMPUTER_ID?.trim() || null : (account?.homeComputerId ?? null),
      candidates: rankCandidates(computers, inUse),
      newComputer: newComputerQuote(view.tier),
      billing: view.billing,
      links: view.links,
    });
  });
}
