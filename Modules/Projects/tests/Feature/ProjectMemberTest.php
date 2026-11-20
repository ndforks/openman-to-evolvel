<?php

namespace Modules\Projects\Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Projects\Models\Project;
use Modules\Projects\Models\ProjectMember;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class ProjectMemberTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_both_the_project_and_the_member(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        $user = User::factory()->create();
        $member = ProjectMember::factory()->for($project)->for($user)->create();

        /* Act */
        $resolvedProject = $member->project;
        $resolvedUser = $member->user;

        /* Assert */
        $this->assertTrue($resolvedProject->is($project));
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_refuses_to_add_the_same_user_to_a_project_twice(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        $user = User::factory()->create();
        ProjectMember::factory()->for($project)->for($user)->create();

        /* Act */
        $thrown = $this->catchThrowable(
            fn () => ProjectMember::factory()->for($project)->for($user)->create()
        );

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('project_members', 1);
    }
}
