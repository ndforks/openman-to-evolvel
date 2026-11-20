<?php

namespace Modules\Tasks\Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskFile;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class TaskFileTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_task_it_was_produced_for(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        $file = TaskFile::factory()->for($task)->create();

        /* Act */
        $resolvedTask = $file->task;

        /* Assert */
        $this->assertTrue($resolvedTask->is($task));
    }

    #[Test]
    public function it_refuses_a_second_file_at_the_same_path_for_the_same_task(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        TaskFile::factory()->for($task)->create(['path' => 'report.md']);

        /* Act */
        $thrown = $this->catchThrowable(
            fn () => TaskFile::factory()->for($task)->create(['path' => 'report.md'])
        );

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('task_files', 1);
    }

    #[Test]
    public function it_allows_the_same_path_for_two_different_tasks(): void
    {
        /* Arrange */
        $first = Task::factory()->create();
        $second = Task::factory()->create();
        TaskFile::factory()->for($first)->create(['path' => 'report.md']);

        /* Act */
        TaskFile::factory()->for($second)->create(['path' => 'report.md']);

        /* Assert */
        $this->assertDatabaseCount('task_files', 2);
    }
}
