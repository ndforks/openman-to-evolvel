<?php

namespace Modules\Core\Contracts;

use App\Models\User;

interface DispatchesWebhooks
{
    /**
     * Queue a delivery for every active webhook of $user that listens for
     * $event. Returns how many deliveries were queued.
     */
    public function dispatch(User $user, string $event, array $payload): int;
}
