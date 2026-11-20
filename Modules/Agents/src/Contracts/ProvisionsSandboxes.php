<?php

namespace Modules\Agents\Contracts;

use Modules\Agents\Models\Sandbox;

interface ProvisionsSandboxes
{
    /**
     * Carve out an isolated git worktree, on its own branch, for one task's
     * run — the replacement for OpenMan's "user's own Orgo computer, Hermes
     * Agent" step, generalised from the previous evolvel's Coordinator
     * design (AGENTS.md).
     */
    public function provision(int $taskId, string $repositoryPath): Sandbox;

    public function destroy(Sandbox $sandbox): void;
}
