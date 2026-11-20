<?php

namespace Modules\Projects\Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Projects\Models\Project;
use Modules\Projects\Models\ProjectFile;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class ProjectFileTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_project_it_was_uploaded_to(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        $file = ProjectFile::factory()->for($project)->create();

        /* Act */
        $resolvedProject = $file->project;

        /* Assert */
        $this->assertTrue($resolvedProject->is($project));
    }

    #[Test]
    public function it_refuses_a_second_file_at_the_same_path_for_the_same_project(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        ProjectFile::factory()->for($project)->create(['path' => 'spec.md']);

        /* Act */
        $thrown = $this->catchThrowable(
            fn () => ProjectFile::factory()->for($project)->create(['path' => 'spec.md'])
        );

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('project_files', 1);
    }
}
