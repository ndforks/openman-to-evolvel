<?php

namespace Modules\Tasks\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tasks\Data\TaskStatus;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskEvent;
use Modules\Tasks\Models\TaskFile;
use Modules\Tasks\Models\TaskMember;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class TaskTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    #[TestWith([TaskStatus::Completed])]
    #[TestWith([TaskStatus::Failed])]
    #[TestWith([TaskStatus::Stopped])]
    public function it_reports_a_terminal_status_as_finished(TaskStatus $status): void
    {
        /* Arrange */
        $task = Task::factory()->create(['status' => $status]);

        /* Act */
        $isFinished = $task->isFinished();

        /* Assert */
        $this->assertTrue($isFinished);
    }

    #[Test]
    #[TestWith([TaskStatus::Queued])]
    #[TestWith([TaskStatus::Running])]
    #[TestWith([TaskStatus::WaitingApproval])]
    public function it_reports_a_non_terminal_status_as_unfinished(TaskStatus $status): void
    {
        /* Arrange */
        $task = Task::factory()->create(['status' => $status]);

        /* Act */
        $isFinished = $task->isFinished();

        /* Assert */
        $this->assertFalse($isFinished);
    }

    #[Test]
    public function it_belongs_to_the_user_who_started_it(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $task->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_lists_its_events_ordered_by_sequence_regardless_of_insert_order(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        TaskEvent::factory()->for($task)->create(['sequence' => 3]);
        TaskEvent::factory()->for($task)->create(['sequence' => 1]);
        TaskEvent::factory()->for($task)->create(['sequence' => 2]);

        /* Act */
        $sequences = $task->events()->pluck('sequence')->all();

        /* Assert */
        $this->assertSame([1, 2, 3], $sequences);
    }

    #[Test]
    public function it_lists_only_its_own_files(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        $otherTask = Task::factory()->create();
        $ownFile = TaskFile::factory()->for($task)->create();
        TaskFile::factory()->for($otherTask)->create();

        /* Act */
        $files = $task->files;

        /* Assert */
        $this->assertCount(1, $files);
        $this->assertTrue($files->first()->is($ownFile));
    }

    #[Test]
    public function it_lists_only_its_own_members(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        $otherTask = Task::factory()->create();
        $ownMember = TaskMember::factory()->for($task)->create();
        TaskMember::factory()->for($otherTask)->create();

        /* Act */
        $members = $task->members;

        /* Assert */
        $this->assertCount(1, $members);
        $this->assertTrue($members->first()->is($ownMember));
    }
}
