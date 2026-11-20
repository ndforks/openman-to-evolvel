<?php

namespace Modules\Agents\Services;

use Modules\Agents\Contracts\AgentRuntime;
use Modules\Agents\Models\Sandbox;
use RuntimeException;

/**
 * The default binding until the OpenCode adapter exists. It deliberately
 * throws instead of returning a fake run id: a caller that silently "ran"
 * nothing would be worse than one that fails loudly and is told why.
 */
class NullAgentRuntime implements AgentRuntime
{
    public function start(Sandbox $sandbox, string $instructions): string
    {
        throw new RuntimeException(
            'No AgentRuntime adapter is configured yet. See AGENTS.md Roadmap: the OpenCode adapter has not been built.'
        );
    }

    public function stop(string $runId): void
    {
        throw new RuntimeException(
            'No AgentRuntime adapter is configured yet. See AGENTS.md Roadmap: the OpenCode adapter has not been built.'
        );
    }
}
