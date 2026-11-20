<?php

namespace Modules\Projects\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Projects\Data\ProposalStatus;
use Modules\Projects\Models\Project;
use Modules\Projects\Models\ProjectProposal;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ProjectProposalTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_project_it_proposes_a_change_to(): void
    {
        /* Arrange */
        $project = Project::factory()->create();
        $proposal = ProjectProposal::factory()->for($project)->create();

        /* Act */
        $resolvedProject = $proposal->project;

        /* Assert */
        $this->assertTrue($resolvedProject->is($project));
    }

    #[Test]
    #[TestWith([ProposalStatus::Pending, false])]
    #[TestWith([ProposalStatus::Approved, true])]
    #[TestWith([ProposalStatus::Rejected, true])]
    public function it_reports_whether_its_status_has_been_decided(ProposalStatus $status, bool $expected): void
    {
        /* Arrange */
        $proposal = ProjectProposal::factory()->create(['status' => $status]);

        /* Act */
        $isDecided = $proposal->status->isDecided();

        /* Assert */
        $this->assertSame($expected, $isDecided);
    }

    #[Test]
    public function it_stores_the_unified_diff_text_verbatim(): void
    {
        /* Arrange */
        $diff = "--- a/app.php\n+++ b/app.php\n@@ -1 +1 @@\n-old line\n+new line\n";

        /* Act */
        $proposal = ProjectProposal::factory()->create(['diff' => $diff]);

        /* Assert */
        $this->assertSame($diff, $proposal->refresh()->diff);
    }
}
