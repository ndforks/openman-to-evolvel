<?php

namespace Modules\Agents\Contracts;

use Modules\Agents\Models\Sandbox;
use Modules\Agents\Services\NullAgentRuntime;

/**
 * The execution engine behind a replaceable adapter (AGENTS.md's stack
 * table). The first real adapter targets OpenCode; until it exists, the
 * bound implementation is {@see NullAgentRuntime},
 * which refuses to pretend a run happened rather than fake success —
 * OpenMan's own "offer only what works" rule, applied to an engine instead
 * of a UI option.
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
