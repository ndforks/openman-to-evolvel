<?php

namespace Modules\Projects\Contracts;

use Modules\Projects\Models\ProjectProposal;

interface ReviewsProposals
{
    public function approve(ProjectProposal $proposal): ProjectProposal;

    public function reject(ProjectProposal $proposal): ProjectProposal;
}
