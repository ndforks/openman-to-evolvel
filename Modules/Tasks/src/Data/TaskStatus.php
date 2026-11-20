<?php

namespace Modules\Tasks\Data;

enum TaskStatus: string
{
    case Queued = 'queued';
    case Running = 'running';
    case WaitingApproval = 'waiting_approval';
    case Completed = 'completed';
    case Failed = 'failed';
    case Stopped = 'stopped';

    public function isTerminal(): bool
    {
        return match ($this) {
            self::Completed, self::Failed, self::Stopped => true,
            default => false,
        };
    }
}
