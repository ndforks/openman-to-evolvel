<?php

namespace Modules\Projects\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use Modules\Projects\Contracts\ReviewsProposals;
use Modules\Projects\Data\ProposalStatus;
use Modules\Projects\Models\ProjectProposal;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class ProposalReviewServiceTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_approves_a_pending_proposal_and_stamps_decided_at(): void
    {
        /* Arrange */
        $proposal = ProjectProposal::factory()->create();
        $service = $this->app->make(ReviewsProposals::class);

        /* Act */
        $decided = $service->approve($proposal);

        /* Assert */
        $this->assertSame(ProposalStatus::Approved, $decided->status);
        $this->assertNotNull($decided->decided_at);
        $this->assertDatabaseHas('project_proposals', [
            'id' => $proposal->id,
            'status' => 'approved',
        ]);
    }

    #[Test]
    public function it_rejects_a_pending_proposal(): void
    {
        /* Arrange */
        $proposal = ProjectProposal::factory()->create();
        $service = $this->app->make(ReviewsProposals::class);

        /* Act */
        $decided = $service->reject($proposal);

        /* Assert */
        $this->assertSame(ProposalStatus::Rejected, $decided->status);
        $this->assertDatabaseHas('project_proposals', [
            'id' => $proposal->id,
            'status' => 'rejected',
        ]);
    }

    #[Test]
    public function it_refuses_to_decide_a_proposal_a_second_time(): void
    {
        /* Arrange */
        $proposal = ProjectProposal::factory()->create(['status' => ProposalStatus::Approved, 'decided_at' => now()]);
        $service = $this->app->make(ReviewsProposals::class);

        /* Act */
        $thrown = $this->catchThrowable(fn () => $service->reject($proposal));

        /* Assert */
        $this->assertInstanceOf(LogicException::class, $thrown);
        $this->assertDatabaseHas('project_proposals', ['id' => $proposal->id, 'status' => 'approved']);
    }
}
