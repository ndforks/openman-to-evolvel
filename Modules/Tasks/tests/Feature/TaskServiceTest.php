<?php

namespace Modules\Tasks\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use Modules\Tasks\Contracts\TracksTasks;
use Modules\Tasks\Data\TaskStatus;
use Modules\Tasks\Models\Task;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class TaskServiceTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_starts_a_task_in_the_queued_status(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $service = $this->app->make(TracksTasks::class);

        /* Act */
        $task = $service->start($user, 'Draft the report', 'Summarise last quarter.');

        /* Assert */
        $this->assertSame(TaskStatus::Queued, $task->status);
        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'user_id' => $user->id,
            'title' => 'Draft the report',
            'status' => 'queued',
        ]);
    }

    #[Test]
    public function it_assigns_gap_free_increasing_sequence_numbers_to_events(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        $service = $this->app->make(TracksTasks::class);

        /* Act */
        $first = $service->recordEvent($task, 'message', ['text' => 'first']);
        $second = $service->recordEvent($task, 'tool_call', ['name' => 'search']);
        $third = $service->recordEvent($task, 'message', ['text' => 'third']);

        /* Assert */
        $this->assertSame([1, 2, 3], [$first->sequence, $second->sequence, $third->sequence]);
    }

    #[Test]
    public function it_moves_a_queued_task_to_running_and_stamps_started_at(): void
    {
        /* Arrange */
        $task = Task::factory()->create(['status' => TaskStatus::Queued, 'started_at' => null]);
        $service = $this->app->make(TracksTasks::class);

        /* Act */
        $updated = $service->transition($task, TaskStatus::Running);

        /* Assert */
        $this->assertSame(TaskStatus::Running, $updated->status);
        $this->assertNotNull($updated->started_at);
    }

    #[Test]
    public function it_refuses_to_transition_a_task_that_already_finished(): void
    {
        /* Arrange */
        $task = Task::factory()->completed()->create();
        $service = $this->app->make(TracksTasks::class);

        /* Act */
        $thrown = $this->catchThrowable(fn () => $service->transition($task, TaskStatus::Running));

        /* Assert */
        $this->assertInstanceOf(LogicException::class, $thrown);
        $this->assertDatabaseHas('tasks', ['id' => $task->id, 'status' => 'completed']);
    }
}
