<?php

namespace Modules\Automations\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Automations\Data\AutomationRunStatus;
use Modules\Automations\Models\Automation;
use Modules\Automations\Models\AutomationRun;

/**
 * @extends Factory<AutomationRun>
 */
class AutomationRunFactory extends Factory
{
    protected $model = AutomationRun::class;

    public function definition(): array
    {
        return [
            'automation_id' => Automation::factory(),
            'status' => AutomationRunStatus::Queued,
            'started_at' => null,
            'finished_at' => null,
            'error' => null,
        ];
    }
}
