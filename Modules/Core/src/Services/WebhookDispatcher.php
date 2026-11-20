<?php

namespace Modules\Core\Services;

use App\Models\User;
use Modules\Core\Contracts\DispatchesWebhooks;
use Modules\Core\Models\Webhook;

class WebhookDispatcher implements DispatchesWebhooks
{
    public function dispatch(User $user, string $event, array $payload): int
    {
        $queued = 0;

        /** @var Webhook $webhook */
        foreach ($user->webhooks()->get() as $webhook) {
            if (! $webhook->listensFor($event)) {
                continue;
            }

            $webhook->deliveries()->create([
                'event' => $event,
                'payload' => $payload,
            ]);

            $queued++;
        }

        return $queued;
    }
}
