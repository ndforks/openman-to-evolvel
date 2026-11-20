<?php

namespace Modules\Automations\Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Automations\Models\Automation;

/**
 * @extends Factory<Automation>
 */
class AutomationFactory extends Factory
{
    protected $model = Automation::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->sentence(3),
            'instructions' => fake()->sentence(),
            'cron_expression' => '0 * * * *',
            'next_run_at' => now()->addHour(),
            'is_enabled' => true,
        ];
    }

    public function due(): static
    {
        return $this->state(fn () => ['next_run_at' => now()->subMinute()]);
    }

    public function disabled(): static
    {
        return $this->state(fn () => ['is_enabled' => false]);
    }
}
