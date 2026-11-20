<?php

namespace Modules\Projects\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Projects\Models\Project;
use Modules\Projects\Models\ProjectFile;
use Modules\Projects\Models\ProjectMember;
use Modules\Projects\Models\ProjectProposal;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ProjectTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_user_who_created_it(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $project->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_lists_only_its_own_files(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        $otherProject = Project::factory()->create();
        $ownFile = ProjectFile::factory()->for($project)->create();
        ProjectFile::factory()->for($otherProject)->create();

        /* Act */
        $files = $project->files;

        /* Assert */
        $this->assertCount(1, $files);
        $this->assertTrue($files->first()->is($ownFile));
    }

    #[Test]
    public function it_lists_only_its_own_members(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        $otherProject = Project::factory()->create();
        $ownMember = ProjectMember::factory()->for($project)->create();
        ProjectMember::factory()->for($otherProject)->create();

        /* Act */
        $members = $project->members;

        /* Assert */
        $this->assertCount(1, $members);
        $this->assertTrue($members->first()->is($ownMember));
    }

    #[Test]
    public function it_lists_only_its_own_proposals(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        $otherProject = Project::factory()->create();
        $ownProposal = ProjectProposal::factory()->for($project)->create();
        ProjectProposal::factory()->for($otherProject)->create();

        /* Act */
        $proposals = $project->proposals;

        /* Assert */
        $this->assertCount(1, $proposals);
        $this->assertTrue($proposals->first()->is($ownProposal));
    }
}
