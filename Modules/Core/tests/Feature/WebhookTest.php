<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\Webhook;
use Modules\Core\Models\WebhookDelivery;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class WebhookTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_listens_for_an_event_it_was_registered_for(): void
    {
        /* Arrange */
        $webhook = Webhook::factory()->create(['events' => ['task.completed', 'task.failed']]);

        /* Act */
        $listens = $webhook->listensFor('task.completed');

        /* Assert */
        $this->assertTrue($listens);
    }

    #[Test]
    public function it_does_not_listen_for_an_event_it_was_not_registered_for(): void
    {
        /* Arrange */
        $webhook = Webhook::factory()->create(['events' => ['task.failed']]);

        /* Act */
        $listens = $webhook->listensFor('task.completed');

        /* Assert */
        $this->assertFalse($listens);
    }

    #[Test]
    public function it_never_listens_while_inactive_even_for_a_registered_event(): void
    {
        /* Arrange */
        $webhook = Webhook::factory()->create(['events' => ['task.completed'], 'is_active' => false]);

        /* Act */
        $listens = $webhook->listensFor('task.completed');

        /* Assert */
        $this->assertFalse($listens);
    }

    #[Test]
    public function it_belongs_to_the_user_who_registered_it(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $webhook = Webhook::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $webhook->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_lists_every_delivery_queued_for_it(): void
    {
        /* Arrange */
        $webhook = Webhook::factory()->create();
        $delivery = WebhookDelivery::factory()->for($webhook)->create();

        /* Act */
        $deliveries = $webhook->deliveries;

        /* Assert */
        $this->assertCount(1, $deliveries);
        $this->assertTrue($deliveries->first()->is($delivery));
    }

    #[Test]
    public function it_never_exposes_the_sealed_secret_when_serialized(): void
    {
        /* Arrange */
        $webhook = Webhook::factory()->create();

        /* Act */
        $array = $webhook->toArray();

        /* Assert */
        $this->assertArrayNotHasKey('sealed_secret', $array);
    }
}
