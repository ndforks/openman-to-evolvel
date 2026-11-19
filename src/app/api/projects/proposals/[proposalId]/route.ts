import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { canEditProject, projectAccess } from "@/lib/db/project-members";
import { getProposalById } from "@/lib/db/project-proposals";

/**
 * GET /api/projects/proposals/[proposalId]: one proposal by id (for the card in the task, which knows only the id).
 * Answered only to someone the project is shared with, or the person whose task proposed it.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ proposalId: string }> }) {
  return withSession(req, async (session) => {
    const { proposalId } = await params;
    const proposal = await getProposalById(proposalId);
    if (!proposal) return jsonError("Proposal not found.", 404);
    const access = await projectAccess(session, proposal.projectId);
    if (!access && proposal.proposedBy !== session.userId) return jsonError("Proposal not found.", 404);
    const { ownerId: _o, proposedBy: _p, decidedBy: _d, ...visible } = proposal;
    void [_o, _p, _d];
    return NextResponse.json(
      { proposal: { ...visible, projectName: access?.project.name ?? "", currentInstructions: access?.project.instructions ?? null }, canDecide: !!access && canEditProject(access.role) && proposal.status === "open" },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
