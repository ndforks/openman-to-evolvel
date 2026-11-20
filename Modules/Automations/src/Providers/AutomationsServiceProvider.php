<?php

namespace Modules\Automations\Providers;

use Illuminate\Support\ServiceProvider;
use Modules\Automations\Console\Commands\TickAutomations;
use Modules\Automations\Contracts\TicksAutomations;
use Modules\Automations\Services\AutomationScheduler;

class AutomationsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(TicksAutomations::class, AutomationScheduler::class);
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([TickAutomations::class]);
        }
    }
}
