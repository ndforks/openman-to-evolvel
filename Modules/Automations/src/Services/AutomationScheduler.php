<?php

namespace Modules\Automations\Services;

use Cron\CronExpression;
use Illuminate\Support\Facades\DB;
use Modules\Automations\Contracts\TicksAutomations;
use Modules\Automations\Data\AutomationRunStatus;
use Modules\Automations\Models\Automation;

class AutomationScheduler implements TicksAutomations
{
    public function tick(): int
    {
        $dueIds = Automation::query()
            ->where('is_enabled', true)
            ->where('next_run_at', '<=', now())
            ->pluck('id');

        $fired = 0;

        foreach ($dueIds as $id) {
            if ($this->fireIfStillDue($id)) {
                $fired++;
            }
        }

        return $fired;
    }

    private function fireIfStillDue(int $automationId): bool
    {
        return DB::transaction(function () use ($automationId) {
            $automation = Automation::query()->lockForUpdate()->find($automationId);

            if (! $automation || ! $automation->is_enabled || $automation->next_run_at->isFuture()) {
                return false;
            }

            $automation->runs()->create(['status' => AutomationRunStatus::Queued]);

            $cron = new CronExpression($automation->cron_expression);

            $automation->update([
                'next_run_at' => $cron->getNextRunDate($automation->next_run_at),
            ]);

            return true;
        });
    }
}
