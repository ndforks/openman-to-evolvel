<?php

namespace Modules\Agents\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Agents\Contracts\AgentRuntime;
use Modules\Agents\Contracts\ProvisionsSandboxes;
use Modules\Agents\Services\GitWorktreeSandboxProvisioner;
use Modules\Agents\Services\OpenCodeAgentRuntime;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AgentsServiceProviderTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_binds_the_agent_runtime_contract_to_the_opencode_adapter(): void
    {
        /* Arrange */
        /* (the binding is registered by AgentsServiceProvider on boot) */

        /* Act */
        $runtime = $this->app->make(AgentRuntime::class);

        /* Assert */
        $this->assertInstanceOf(OpenCodeAgentRuntime::class, $runtime);
    }

    #[Test]
    public function it_binds_the_sandbox_provisioner_contract_to_the_git_worktree_implementation(): void
    {
        /* Arrange */
        /* (the binding is registered by AgentsServiceProvider on boot) */

        /* Act */
        $provisioner = $this->app->make(ProvisionsSandboxes::class);

        /* Assert */
        $this->assertInstanceOf(GitWorktreeSandboxProvisioner::class, $provisioner);
    }
}
