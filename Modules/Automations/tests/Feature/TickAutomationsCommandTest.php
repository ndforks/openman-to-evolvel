<?php

namespace Modules\Automations\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Modules\Automations\Models\Automation;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The self-hosted replacement for OpenMan's external `scripts/worker.mjs`,
 * driven from the command line exactly as `php artisan automations:tick`
 * (or the scheduled call in routes/console.php) would run it.
 *
 * Uses Artisan::call() + Artisan::output() rather than
 * $this->artisan(...)->expectsOutputToContain(...): that mocks the console
 * output through a fresh invocation that, against a real database
 * connection, ran the command's writes outside the transaction
 * RefreshDatabase wraps this test in — the rows never showed up in the
 * assertion that followed. Asserting on the real output string avoids it.
 */
class TickAutomationsCommandTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_reports_how_many_automations_it_fired(): void
    {
        /* Arrange */
        Automation::factory()->due()->count(2)->create();

        /* Act */
        $exitCode = Artisan::call('automations:tick');

        /* Assert */
        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('Fired 2 automation(s).', Artisan::output());
        $this->assertDatabaseCount('automation_runs', 2);
    }

    #[Test]
    public function it_reports_zero_when_nothing_is_due(): void
    {
        /* Arrange */
        Automation::factory()->create(['next_run_at' => now()->addDay()]);

        /* Act */
        $exitCode = Artisan::call('automations:tick');

        /* Assert */
        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('Fired 0 automation(s).', Artisan::output());
        $this->assertDatabaseCount('automation_runs', 0);
    }
}
