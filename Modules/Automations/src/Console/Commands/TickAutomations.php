<?php

namespace Modules\Automations\Console\Commands;

use Illuminate\Console\Command;
use Modules\Automations\Contracts\TicksAutomations;

/**
 * The self-hosted replacement for OpenMan's `scripts/worker.mjs`, scheduled
 * every minute (`routes/console.php`) instead of an external cron hitting
 * `POST /api/cron/tick`.
 */
class TickAutomations extends Command
{
    protected $signature = 'automations:tick';

    protected $description = 'Fire every automation whose next run is due.';

    public function handle(TicksAutomations $scheduler): int
    {
        $fired = $scheduler->tick();

        $this->info("Fired {$fired} automation(s).");

        return self::SUCCESS;
    }
}
