<?php

namespace Modules\Automations\Data;

enum AutomationRunStatus: string
{
    case Queued = 'queued';
    case Succeeded = 'succeeded';
    case Failed = 'failed';
}
