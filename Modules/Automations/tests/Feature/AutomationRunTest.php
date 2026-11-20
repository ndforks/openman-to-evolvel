<?php

namespace Modules\Automations\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Automations\Data\AutomationRunStatus;
use Modules\Automations\Models\Automation;
use Modules\Automations\Models\AutomationRun;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AutomationRunTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_automation_it_ran_for(): void
    {
        /* Arrange */
        $automation = Automation::factory()->create();
        $run = AutomationRun::factory()->for($automation)->create();

        /* Act */
        $resolvedAutomation = $run->automation;

        /* Assert */
        $this->assertTrue($resolvedAutomation->is($automation));
    }

    #[Test]
    public function it_records_a_failure_with_its_error_message(): void
    {
        /* Arrange */
        $run = AutomationRun::factory()->create(['status' => AutomationRunStatus::Queued]);

        /* Act */
        $run->update([
            'status' => AutomationRunStatus::Failed,
            'started_at' => now()->subSeconds(5),
            'finished_at' => now(),
            'error' => 'The connector timed out.',
        ]);

        /* Assert */
        $this->assertDatabaseHas('automation_runs', [
            'id' => $run->id,
            'status' => 'failed',
            'error' => 'The connector timed out.',
        ]);
    }

    #[Test]
    public function it_starts_with_no_error_recorded(): void
    {
        /* Arrange */
        /* (nothing to arrange beyond the factory defaults) */

        /* Act */
        $run = AutomationRun::factory()->create();

        /* Assert */
        $this->assertNull($run->error);
        $this->assertSame(AutomationRunStatus::Queued, $run->status);
    }
}
