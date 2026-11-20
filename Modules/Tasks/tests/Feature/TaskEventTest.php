<?php

namespace Modules\Tasks\Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskEvent;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class TaskEventTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_task_it_happened_on(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        $event = TaskEvent::factory()->for($task)->create();

        /* Act */
        $resolvedTask = $event->task;

        /* Assert */
        $this->assertTrue($resolvedTask->is($task));
    }

    #[Test]
    public function it_casts_its_data_payload_to_an_array(): void
    {
        /* Arrange */
        $event = TaskEvent::factory()->create([
            'type' => 'tool_call',
            'data' => ['name' => 'search', 'arguments' => ['query' => 'laravel modules']],
        ]);

        /* Act */
        $fresh = $event->refresh();

        /* Assert */
        $this->assertSame(['name' => 'search', 'arguments' => ['query' => 'laravel modules']], $fresh->data);
    }

    #[Test]
    public function it_refuses_a_second_event_at_the_same_sequence_for_the_same_task(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        TaskEvent::factory()->for($task)->create(['sequence' => 1]);

        /* Act */
        $thrown = $this->catchThrowable(fn () => TaskEvent::factory()->for($task)->create(['sequence' => 1]));

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('task_events', 1);
    }
}
