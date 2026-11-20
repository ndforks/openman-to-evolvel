<?php

namespace Modules\Tasks\Providers;

use Illuminate\Support\ServiceProvider;
use Modules\Tasks\Contracts\TracksTasks;
use Modules\Tasks\Services\TaskService;

class TasksServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(TracksTasks::class, TaskService::class);
    }
}
