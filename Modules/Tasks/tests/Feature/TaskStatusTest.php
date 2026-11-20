<?php

namespace Modules\Tasks\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tasks\Data\TaskStatus;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

/**
 * A plain enum with no I/O, but its terminal/non-terminal split drives
 * TaskService::transition's one business rule, so it is tested as part of
 * that flow here rather than skipped as "just an enum".
 */
class TaskStatusTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    #[TestWith([TaskStatus::Completed, true])]
    #[TestWith([TaskStatus::Failed, true])]
    #[TestWith([TaskStatus::Stopped, true])]
    #[TestWith([TaskStatus::Queued, false])]
    #[TestWith([TaskStatus::Running, false])]
    #[TestWith([TaskStatus::WaitingApproval, false])]
    public function it_classifies_each_status_as_terminal_or_not(TaskStatus $status, bool $expected): void
    {
        /* Arrange */
        /* (nothing to arrange: the enum under test carries its own cases) */

        /* Act */
        $isTerminal = $status->isTerminal();

        /* Assert */
        $this->assertSame($expected, $isTerminal);
    }
}
