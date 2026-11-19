// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { decideFromRoute, ProposalError } from "@/lib/agent/server/project-updates";
import { canEditProject, projectAccess } from "@/lib/db/project-members";
import { getProposal } from "@/lib/db/project-proposals";

type Params = { params: Promise<{ id: string; proposalId: string }> };
const notFound = () => jsonError("Proposal not found.", 404);

/**
 * GET /api/projects/[id]/proposals/[proposalId]: changes the agent proposed for the project (shown as a diff), with
 * whether the caller may decide. Anyone the project is shared with may look; the task's owner proposed it.
 */
export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id, proposalId } = await params;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    const proposal = await getProposal(access.ownerId, id, proposalId);
    if (!proposal) return notFound();
    const { ownerId: _o, proposedBy: _p, decidedBy: _d, ...visible } = proposal;
    void [_o, _p, _d];
    return NextResponse.json(
      { proposal: { ...visible, projectName: access.project.name, currentInstructions: access.project.instructions }, canDecide: canEditProject(access.role) && proposal.status === "open" },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

const schema = z.object({ decision: z.enum(["apply", "dismiss"]) });

/** POST /api/projects/[id]/proposals/[proposalId] {decision}: apply or dismiss. Owner and editors only. */
export function POST(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id, proposalId } = await params;
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    if (!canEditProject(access.role)) return jsonError("Only the project's owner and editors can apply changes.", 403);
    const proposal = await getProposal(access.ownerId, id, proposalId);
    if (!proposal) return notFound();
    try {
      await decideFromRoute(proposal, session.userId, body.data.decision === "apply");
    } catch (err) {
      if (err instanceof ProposalError) return jsonError(err.message, err.status);
      throw err;
    }
    return NextResponse.json({ ok: true, status: body.data.decision === "apply" ? "applied" : "dismissed" });
  });
}
