<?php

namespace Modules\Tasks\Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskMember;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class TaskMemberTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_both_the_task_and_the_member(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        $user = User::factory()->create();
        $member = TaskMember::factory()->for($task)->for($user)->create();

        /* Act */
        $resolvedTask = $member->task;
        $resolvedUser = $member->user;

        /* Assert */
        $this->assertTrue($resolvedTask->is($task));
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_refuses_to_add_the_same_user_to_a_task_twice(): void
    {
        /* Arrange */
        $task = Task::factory()->create();
        $user = User::factory()->create();
        TaskMember::factory()->for($task)->for($user)->create();

        /* Act */
        $thrown = $this->catchThrowable(
            fn () => TaskMember::factory()->for($task)->for($user)->create()
        );

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('task_members', 1);
    }

    #[Test]
    public function it_defaults_a_new_member_to_the_viewer_role(): void
    {
        /* Arrange */
        /* (nothing to arrange beyond the factory defaults) */

        /* Act */
        $member = TaskMember::factory()->create();

        /* Assert */
        $this->assertSame('viewer', $member->role);
    }
}
