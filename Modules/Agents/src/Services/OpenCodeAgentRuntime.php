<?php

namespace Modules\Agents\Services;

use Illuminate\Support\Facades\Process;
use Modules\Agents\Contracts\AgentRuntime;
use Modules\Agents\Models\Sandbox;
use RuntimeException;

/**
 * Drives OpenCode (`sst/opencode`, the `opencode-ai` CLI — see AGENTS.md
 * §3, "Agent execution") as the execution engine behind the AgentRuntime
 * contract.
 *
 * `start()` launches `opencode run` as a detached background process
 * rooted at the sandbox's worktree and returns immediately, without
 * waiting for the run to finish — the contract promises an opaque run id
 * the caller can use "later" to steer or stop it, which only makes sense
 * if the run is still going when start() returns.
 *
 * The run id handed back is that process's OS process id, prefixed so it
 * can never be mistaken for anything else ("opencode:<pid>"). There is
 * nowhere else to keep it between the HTTP request that calls start() and
 * a later one that calls stop(): the PHP process that called start() has
 * already ended by the time stop() is called, so the PID in the run id
 * *is* the handle.
 */
class OpenCodeAgentRuntime implements AgentRuntime
{
    private const string RUN_ID_PREFIX = 'opencode:';

    public function __construct(
        private readonly string $binary = 'opencode',
    ) {}

    public function start(Sandbox $sandbox, string $instructions): string
    {
        $process = Process::path($sandbox->worktree_path)
            ->timeout(0)
            ->start([
                $this->binary,
                'run',
                $instructions,
                '--dir', $sandbox->worktree_path,
                '--format', 'json',
                '--auto',
                '--title', "evolvel-task-{$sandbox->task_id}",
            ]);

        return self::RUN_ID_PREFIX.$process->id();
    }

    public function stop(string $runId): void
    {
        // A run that has already finished on its own has nothing left to
        // stop — sending it a signal would just fail with "no such
        // process", which is not a caller error.
        Process::run(['kill', '-TERM', (string) $this->pidFrom($runId)]);
    }

    private function pidFrom(string $runId): int
    {
        if (! str_starts_with($runId, self::RUN_ID_PREFIX)) {
            throw new RuntimeException(
                "'{$runId}' was not issued by ".self::class.' and cannot be stopped by it.'
            );
        }

        return (int) substr($runId, strlen(self::RUN_ID_PREFIX));
    }
}
