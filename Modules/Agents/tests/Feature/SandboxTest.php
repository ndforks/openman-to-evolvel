<?php

namespace Modules\Agents\Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Agents\Data\SandboxStatus;
use Modules\Agents\Models\Sandbox;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class SandboxTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_casts_its_status_to_the_sandbox_status_enum(): void
    {
        /* Arrange */
        $sandbox = Sandbox::factory()->create(['status' => SandboxStatus::Provisioning]);

        /* Act */
        $fresh = $sandbox->refresh();

        /* Assert */
        $this->assertSame(SandboxStatus::Provisioning, $fresh->status);
    }

    #[Test]
    public function it_refuses_a_second_sandbox_for_a_task_that_already_has_one(): void
    {
        /* Arrange */
        Sandbox::factory()->create(['task_id' => 55]);

        /* Act */
        $thrown = $this->catchThrowable(fn () => Sandbox::factory()->create(['task_id' => 55]));

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('sandboxes', 1);
    }
}
