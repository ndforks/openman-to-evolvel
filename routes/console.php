<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Self-hosted replacement for OpenMan's external `scripts/worker.mjs` tick.
Schedule::command('automations:tick')->everyMinute()->withoutOverlapping();
