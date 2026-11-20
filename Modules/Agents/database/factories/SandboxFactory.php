<?php

namespace Modules\Agents\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Agents\Data\SandboxStatus;
use Modules\Agents\Models\Sandbox;

/**
 * @extends Factory<Sandbox>
 */
class SandboxFactory extends Factory
{
    protected $model = Sandbox::class;

    public function definition(): array
    {
        return [
            'task_id' => fake()->unique()->numberBetween(1, 1_000_000),
            'repository_path' => '/tmp/evolvel-example-repo',
            'worktree_path' => '/tmp/evolvel-example-worktree',
            'branch' => 'evolvel/task-'.fake()->uuid(),
            'status' => SandboxStatus::Ready,
        ];
    }
}
