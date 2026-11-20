<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Contracts\DispatchesWebhooks;
use Modules\Core\Models\Webhook;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class WebhookDispatcherTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_queues_a_delivery_for_a_webhook_listening_to_the_event(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $webhook = Webhook::factory()->for($user)->create(['events' => ['task.completed']]);
        $dispatcher = $this->app->make(DispatchesWebhooks::class);

        /* Act */
        $queued = $dispatcher->dispatch($user, 'task.completed', ['task_id' => 42]);

        /* Assert */
        $this->assertSame(1, $queued);
        $this->assertDatabaseHas('webhook_deliveries', [
            'webhook_id' => $webhook->id,
            'event' => 'task.completed',
        ]);
    }

    #[Test]
    public function it_skips_a_webhook_that_does_not_listen_for_the_event(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        Webhook::factory()->for($user)->create(['events' => ['task.failed']]);
        $dispatcher = $this->app->make(DispatchesWebhooks::class);

        /* Act */
        $queued = $dispatcher->dispatch($user, 'task.completed', ['task_id' => 42]);

        /* Assert */
        $this->assertSame(0, $queued);
        $this->assertDatabaseCount('webhook_deliveries', 0);
    }

    #[Test]
    public function it_skips_an_inactive_webhook_even_if_it_lists_the_event(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        Webhook::factory()->for($user)->create([
            'events' => ['task.completed'],
            'is_active' => false,
        ]);
        $dispatcher = $this->app->make(DispatchesWebhooks::class);

        /* Act */
        $queued = $dispatcher->dispatch($user, 'task.completed', ['task_id' => 42]);

        /* Assert */
        $this->assertSame(0, $queued);
        $this->assertDatabaseCount('webhook_deliveries', 0);
    }

    #[Test]
    public function it_never_queues_a_delivery_for_another_users_webhook(): void
    {
        /* Arrange */
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        Webhook::factory()->for($owner)->create(['events' => ['task.completed']]);
        $dispatcher = $this->app->make(DispatchesWebhooks::class);

        /* Act */
        $queued = $dispatcher->dispatch($otherUser, 'task.completed', ['task_id' => 42]);

        /* Assert */
        $this->assertSame(0, $queued);
        $this->assertDatabaseCount('webhook_deliveries', 0);
    }
}
