<?php

namespace Modules\Tasks\Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskMember;

/**
 * @extends Factory<TaskMember>
 */
class TaskMemberFactory extends Factory
{
    protected $model = TaskMember::class;

    public function definition(): array
    {
        return [
            'task_id' => Task::factory(),
            'user_id' => User::factory(),
            'role' => 'viewer',
        ];
    }
}
