<?php

namespace Modules\Agents\Tests\Unit;

use Modules\Agents\Models\Sandbox;
use Modules\Agents\Services\NullAgentRuntime;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Tests\Support\CatchesThrowables;

class NullAgentRuntimeTest extends TestCase
{
    use CatchesThrowables;

    #[Test]
    public function it_refuses_to_pretend_a_run_started(): void
    {
        /* Arrange */
        $runtime = new NullAgentRuntime;
        $sandbox = new Sandbox;

        /* Act */
        $thrown = $this->catchThrowable(fn () => $runtime->start($sandbox, 'do something'));

        /* Assert */
        $this->assertInstanceOf(RuntimeException::class, $thrown);
    }
}
