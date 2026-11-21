<?php

namespace Modules\Agents\Contracts;

use Modules\Agents\Models\Sandbox;
use Modules\Agents\Services\NullAgentRuntime;
use Modules\Agents\Services\OpenCodeAgentRuntime;

/**
 * The execution engine behind a replaceable adapter (AGENTS.md §3, "Stack").
 * The bound implementation is {@see OpenCodeAgentRuntime}, which drives the
 * `opencode` CLI as a background process per run. {@see NullAgentRuntime}
 * remains available for deployments or tests with no `opencode` binary; it
 * refuses to pretend a run happened rather than fake success — OpenMan's
 * own "offer only what works" rule, applied to an engine instead of a UI
 * option.
 */
interface AgentRuntime
{
    /**
     * Start running $instructions inside the given sandbox. Returns an
     * opaque run identifier the caller can later use to steer or stop it.
     */
    public function start(Sandbox $sandbox, string $instructions): string;

    public function stop(string $runId): void;
}
