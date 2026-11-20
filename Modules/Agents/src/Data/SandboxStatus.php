<?php

namespace Modules\Agents\Data;

enum SandboxStatus: string
{
    case Provisioning = 'provisioning';
    case Ready = 'ready';
    case Failed = 'failed';
    case Destroyed = 'destroyed';
}
