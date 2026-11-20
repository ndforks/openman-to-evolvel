<?php

namespace Modules\Tasks\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskFile;

/**
 * @extends Factory<TaskFile>
 */
class TaskFileFactory extends Factory
{
    protected $model = TaskFile::class;

    public function definition(): array
    {
        $path = fake()->unique()->slug().'.md';

        return [
            'task_id' => Task::factory(),
            'path' => $path,
            'size_bytes' => fake()->numberBetween(10, 50_000),
            'disk_path' => "workspaces/placeholder/{$path}",
        ];
    }
}
