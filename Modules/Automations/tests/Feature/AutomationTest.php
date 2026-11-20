<?php

namespace Modules\Automations\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Automations\Models\Automation;
use Modules\Automations\Models\AutomationRun;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AutomationTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_user_who_created_it(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $automation = Automation::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $automation->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_lists_only_its_own_runs_in_order_of_creation(): void
    {
        /* Arrange */
        $automation = Automation::factory()->create();
        $otherAutomation = Automation::factory()->create();
        $firstRun = AutomationRun::factory()->for($automation)->create();
        $secondRun = AutomationRun::factory()->for($automation)->create();
        AutomationRun::factory()->for($otherAutomation)->create();

        /* Act */
        $runs = $automation->runs;

        /* Assert */
        $this->assertCount(2, $runs);
        $this->assertTrue($runs->pluck('id')->contains($firstRun->id));
        $this->assertTrue($runs->pluck('id')->contains($secondRun->id));
    }

    #[Test]
    public function it_casts_is_enabled_to_a_boolean(): void
    {
        /* Arrange */
        $automation = Automation::factory()->disabled()->create();

        /* Act */
        $fresh = $automation->refresh();

        /* Assert */
        $this->assertFalse($fresh->is_enabled);
        $this->assertIsBool($fresh->is_enabled);
    }
}
