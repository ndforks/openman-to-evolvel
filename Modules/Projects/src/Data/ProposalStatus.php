<?php

namespace Modules\Projects\Data;

enum ProposalStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';

    public function isDecided(): bool
    {
        return $this !== self::Pending;
    }
}
