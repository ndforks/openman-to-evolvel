<?php

namespace Modules\Tasks\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskEvent;

/**
 * @extends Factory<TaskEvent>
 */
class TaskEventFactory extends Factory
{
    protected $model = TaskEvent::class;

    public function definition(): array
    {
        return [
            'task_id' => Task::factory(),
            'type' => 'message',
            'data' => ['text' => fake()->sentence()],
            'sequence' => fake()->unique()->numberBetween(1, 1_000_000),
        ];
    }
}
