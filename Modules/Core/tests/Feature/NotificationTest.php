<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\Notification;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_reports_a_fresh_notification_as_unread(): void
    {
        /* Arrange */
        $notification = Notification::factory()->create();

        /* Act */
        $isRead = $notification->isRead();

        /* Assert */
        $this->assertFalse($isRead);
    }

    #[Test]
    public function it_reports_a_notification_marked_read_as_read(): void
    {
        /* Arrange */
        $notification = Notification::factory()->read()->create();

        /* Act */
        $isRead = $notification->isRead();

        /* Assert */
        $this->assertTrue($isRead);
    }

    #[Test]
    public function it_belongs_to_the_user_it_was_sent_to(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $notification = Notification::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $notification->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_persists_an_arbitrary_data_payload_as_an_array(): void
    {
        /* Arrange */
        $notification = Notification::factory()->create([
            'type' => 'task.completed',
            'data' => ['task_id' => 99, 'title' => 'Draft the report'],
        ]);

        /* Act */
        $fresh = $notification->refresh();

        /* Assert */
        $this->assertSame(['task_id' => 99, 'title' => 'Draft the report'], $fresh->data);
    }
}
