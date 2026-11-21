<?php

namespace Modules\Agents\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Modules\Agents\Models\Sandbox;
use Modules\Agents\Services\OpenCodeAgentRuntime;
use PHPUnit\Framework\Attributes\Test;
use RuntimeException;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

/**
 * Exercises the adapter against real stand-in scripts for the `opencode`
 * CLI (Modules/Agents/tests/Support/fake-opencode*.sh) rather than mocking
 * the Process facade: the behaviour under test — a real background
 * process gets started, outlives start()'s return, and can later be
 * signalled to stop by a PID alone — can only be shown true by actually
 * doing it.
 */
class OpenCodeAgentRuntimeTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    private string $worktreePath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->worktreePath = storage_path('framework/testing/opencode-worktree-'.uniqid());
        File::makeDirectory($this->worktreePath, 0755, true);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->worktreePath);

        parent::tearDown();
    }

    private function fakeOpencodePath(string $script = 'fake-opencode.sh'): string
    {
        return __DIR__.'/../Support/'.$script;
    }

    #[Test]
    public function it_starts_opencode_in_the_sandboxs_worktree_with_the_instructions(): void
    {
        /* Arrange */
        $sandbox = Sandbox::factory()->create(['worktree_path' => $this->worktreePath, 'task_id' => 11]);
        $runtime = new OpenCodeAgentRuntime($this->fakeOpencodePath());

        /* Act */
        $runId = $runtime->start($sandbox, 'summarise the open issues');

        /* Assert */
        $this->waitForFile($this->worktreePath.'/received-args.txt');
        $receivedArgs = file($this->worktreePath.'/received-args.txt', FILE_IGNORE_NEW_LINES);
        $this->assertSame('run', $receivedArgs[0]);
        $this->assertSame('summarise the open issues', $receivedArgs[1]);
        $this->assertContains($this->worktreePath, $receivedArgs);
        $this->assertContains('evolvel-task-11', $receivedArgs);

        $this->stopPidFromRunId($runId);
    }

    #[Test]
    public function it_returns_a_run_id_carrying_the_processs_own_pid(): void
    {
        /* Arrange */
        $sandbox = Sandbox::factory()->create(['worktree_path' => $this->worktreePath]);
        $runtime = new OpenCodeAgentRuntime($this->fakeOpencodePath());

        /* Act */
        $runId = $runtime->start($sandbox, 'do something');

        /* Assert */
        $this->assertMatchesRegularExpression('/^opencode:\d+$/', $runId);

        $this->stopPidFromRunId($runId);
    }

    #[Test]
    public function it_returns_without_waiting_for_the_run_to_finish(): void
    {
        /* Arrange */
        $sandbox = Sandbox::factory()->create(['worktree_path' => $this->worktreePath]);
        $runtime = new OpenCodeAgentRuntime($this->fakeOpencodePath());

        /* Act */
        $startedAt = microtime(true);
        $runId = $runtime->start($sandbox, 'a run that would otherwise take 30 seconds');
        $elapsed = microtime(true) - $startedAt;

        /* Assert */
        $this->assertLessThan(2.0, $elapsed);

        $this->stopPidFromRunId($runId);
    }

    #[Test]
    public function it_stops_the_running_process_it_started(): void
    {
        /* Arrange */
        $sandbox = Sandbox::factory()->create(['worktree_path' => $this->worktreePath]);
        $runtime = new OpenCodeAgentRuntime($this->fakeOpencodePath());
        $runId = $runtime->start($sandbox, 'a run that would otherwise take 30 seconds');
        $pid = (int) substr($runId, strlen('opencode:'));
        $this->assertTrue($this->processIsAlive($pid), 'the fake run should still be alive before stop()');

        /* Act */
        $runtime->stop($runId);

        /* Assert */
        $this->assertFalse($this->waitUntilDead($pid), 'stop() should terminate the process');
    }

    #[Test]
    public function it_does_not_throw_when_stopping_a_run_that_already_finished(): void
    {
        /* Arrange */
        $sandbox = Sandbox::factory()->create(['worktree_path' => $this->worktreePath]);
        $runtime = new OpenCodeAgentRuntime($this->fakeOpencodePath('fake-opencode-quick.sh'));
        $runId = $runtime->start($sandbox, 'a run that exits immediately');
        $this->waitUntilDead((int) substr($runId, strlen('opencode:')));

        /* Act */
        $thrown = $this->catchThrowable(fn () => $runtime->stop($runId));

        /* Assert */
        $this->assertNull($thrown);
    }

    #[Test]
    public function it_refuses_to_stop_a_run_id_it_did_not_issue(): void
    {
        /* Arrange */
        $runtime = new OpenCodeAgentRuntime($this->fakeOpencodePath());

        /* Act */
        $thrown = $this->catchThrowable(fn () => $runtime->stop('some-other-adapters-run-id'));

        /* Assert */
        $this->assertInstanceOf(RuntimeException::class, $thrown);
    }

    private function waitForFile(string $path, float $timeoutSeconds = 5.0): void
    {
        $deadline = microtime(true) + $timeoutSeconds;

        while (! File::exists($path) && microtime(true) < $deadline) {
            usleep(20_000);
        }

        $this->assertFileExists($path);
    }

    /**
     * True while the process is genuinely running. A terminated process
     * stays visible to posix_kill() as a zombie until this test's own
     * process (its parent) reaps it, so the process table's own state
     * column — not posix_kill() alone — is what tells "stopped" apart
     * from "exited but not yet reaped".
     */
    private function processIsAlive(int $pid): bool
    {
        $state = trim((string) shell_exec("ps -o stat= -p {$pid} 2>/dev/null"));

        return $state !== '' && ! str_starts_with($state, 'Z');
    }

    private function waitUntilDead(int $pid, float $timeoutSeconds = 5.0): bool
    {
        $deadline = microtime(true) + $timeoutSeconds;

        while ($this->processIsAlive($pid) && microtime(true) < $deadline) {
            usleep(20_000);
        }

        return $this->processIsAlive($pid);
    }

    private function stopPidFromRunId(string $runId): void
    {
        $pid = (int) substr($runId, strlen('opencode:'));
        posix_kill($pid, SIGTERM);
    }
}
