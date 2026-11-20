<?php

namespace Modules\Core\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Core\Models\Webhook;
use Modules\Core\Models\WebhookDelivery;

/**
 * @extends Factory<WebhookDelivery>
 */
class WebhookDeliveryFactory extends Factory
{
    protected $model = WebhookDelivery::class;

    public function definition(): array
    {
        return [
            'webhook_id' => Webhook::factory(),
            'event' => 'task.completed',
            'payload' => ['task_id' => fake()->uuid()],
            'response_status' => null,
            'attempts' => 0,
            'delivered_at' => null,
        ];
    }

    public function delivered(): static
    {
        return $this->state(fn () => [
            'response_status' => 200,
            'attempts' => 1,
            'delivered_at' => now(),
        ]);
    }
}
