<?php

namespace Modules\Projects\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Projects\Data\ProposalStatus;
use Modules\Projects\Models\Project;
use Modules\Projects\Models\ProjectProposal;

/**
 * @extends Factory<ProjectProposal>
 */
class ProjectProposalFactory extends Factory
{
    protected $model = ProjectProposal::class;

    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'task_id' => null,
            'summary' => fake()->sentence(),
            'diff' => "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n",
            'status' => ProposalStatus::Pending,
            'decided_at' => null,
        ];
    }
}
