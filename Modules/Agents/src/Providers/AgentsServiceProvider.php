<?php

namespace Modules\Agents\Providers;

use Illuminate\Support\ServiceProvider;
use Modules\Agents\Contracts\AgentRuntime;
use Modules\Agents\Contracts\ProvisionsSandboxes;
use Modules\Agents\Services\GitWorktreeSandboxProvisioner;
use Modules\Agents\Services\NullAgentRuntime;

class AgentsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(AgentRuntime::class, NullAgentRuntime::class);

        $this->app->bind(ProvisionsSandboxes::class, fn () => new GitWorktreeSandboxProvisioner(
            storage_path('app/sandboxes')
        ));
    }
}
