<?php

namespace Modules\Core\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\Webhook;
use Modules\Core\Models\WebhookDelivery;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class WebhookDeliveryTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_reports_an_undelivered_delivery_as_not_delivered(): void
    {
        /* Arrange */
        $delivery = WebhookDelivery::factory()->create();

        /* Act */
        $wasDelivered = $delivery->wasDelivered();

        /* Assert */
        $this->assertFalse($wasDelivered);
    }

    #[Test]
    public function it_reports_a_delivered_delivery_as_delivered(): void
    {
        /* Arrange */
        $delivery = WebhookDelivery::factory()->delivered()->create();

        /* Act */
        $wasDelivered = $delivery->wasDelivered();

        /* Assert */
        $this->assertTrue($wasDelivered);
    }

    #[Test]
    public function it_belongs_to_the_webhook_it_was_queued_for(): void
    {
        /* Arrange */
        $webhook = Webhook::factory()->create();
        $delivery = WebhookDelivery::factory()->for($webhook)->create();

        /* Act */
        $resolvedWebhook = $delivery->webhook;

        /* Assert */
        $this->assertTrue($resolvedWebhook->is($webhook));
    }

    #[Test]
    public function it_persists_the_response_status_once_delivered(): void
    {
        /* Arrange */
        $delivery = WebhookDelivery::factory()->create(['response_status' => null, 'attempts' => 0]);

        /* Act */
        $delivery->update(['response_status' => 503, 'attempts' => 1]);

        /* Assert */
        $this->assertDatabaseHas('webhook_deliveries', [
            'id' => $delivery->id,
            'response_status' => 503,
            'attempts' => 1,
        ]);
    }
}
