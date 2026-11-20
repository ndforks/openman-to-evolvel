<?php

namespace Modules\Core\Providers;

use Illuminate\Support\ServiceProvider;
use Modules\Core\Contracts\DispatchesWebhooks;
use Modules\Core\Contracts\IssuesApiKeys;
use Modules\Core\Services\ApiKeyService;
use Modules\Core\Services\WebhookDispatcher;

class CoreServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(IssuesApiKeys::class, ApiKeyService::class);
        $this->app->bind(DispatchesWebhooks::class, WebhookDispatcher::class);
    }

    public function boot(): void {}
}
