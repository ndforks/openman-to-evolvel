<?php

namespace Modules\Projects\Services;

use LogicException;
use Modules\Projects\Contracts\ReviewsProposals;
use Modules\Projects\Data\ProposalStatus;
use Modules\Projects\Models\ProjectProposal;

class ProposalReviewService implements ReviewsProposals
{
    public function approve(ProjectProposal $proposal): ProjectProposal
    {
        return $this->decide($proposal, ProposalStatus::Approved);
    }

    public function reject(ProjectProposal $proposal): ProjectProposal
    {
        return $this->decide($proposal, ProposalStatus::Rejected);
    }

    private function decide(ProjectProposal $proposal, ProposalStatus $status): ProjectProposal
    {
        if ($proposal->status->isDecided()) {
            throw new LogicException(
                "Proposal #{$proposal->id} was already {$proposal->status->value} and cannot be decided again."
            );
        }

        $proposal->update([
            'status' => $status,
            'decided_at' => now(),
        ]);

        return $proposal->refresh();
    }
}
