<?php

namespace Modules\Automations\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Automations\Contracts\TicksAutomations;
use Modules\Automations\Models\Automation;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AutomationSchedulerTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_fires_a_due_automation_and_queues_a_run(): void
    {
        /* Arrange */
        $automation = Automation::factory()->due()->create(['cron_expression' => '0 * * * *']);
        $scheduler = $this->app->make(TicksAutomations::class);

        /* Act */
        $fired = $scheduler->tick();

        /* Assert */
        $this->assertSame(1, $fired);
        $this->assertDatabaseHas('automation_runs', [
            'automation_id' => $automation->id,
            'status' => 'queued',
        ]);
    }

    #[Test]
    public function it_advances_next_run_at_past_now_using_the_cron_expression(): void
    {
        /* Arrange */
        $automation = Automation::factory()->due()->create(['cron_expression' => '0 * * * *']);
        $scheduler = $this->app->make(TicksAutomations::class);

        /* Act */
        $scheduler->tick();

        /* Assert */
        $this->assertTrue($automation->refresh()->next_run_at->isFuture());
    }

    #[Test]
    public function it_never_fires_a_disabled_automation(): void
    {
        /* Arrange */
        Automation::factory()->due()->disabled()->create();
        $scheduler = $this->app->make(TicksAutomations::class);

        /* Act */
        $fired = $scheduler->tick();

        /* Assert */
        $this->assertSame(0, $fired);
        $this->assertDatabaseCount('automation_runs', 0);
    }

    #[Test]
    public function it_never_fires_an_automation_whose_next_run_is_in_the_future(): void
    {
        /* Arrange */
        Automation::factory()->create(['next_run_at' => now()->addDay()]);
        $scheduler = $this->app->make(TicksAutomations::class);

        /* Act */
        $fired = $scheduler->tick();

        /* Assert */
        $this->assertSame(0, $fired);
        $this->assertDatabaseCount('automation_runs', 0);
    }

    #[Test]
    public function it_fires_each_of_several_due_automations_exactly_once(): void
    {
        /* Arrange */
        Automation::factory()->due()->count(3)->create();
        $scheduler = $this->app->make(TicksAutomations::class);

        /* Act */
        $fired = $scheduler->tick();

        /* Assert */
        $this->assertSame(3, $fired);
        $this->assertDatabaseCount('automation_runs', 3);
    }
}
