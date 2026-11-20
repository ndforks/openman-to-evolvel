<?php

namespace Modules\Projects\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Projects\Models\Project;
use Modules\Projects\Models\ProjectFile;

/**
 * @extends Factory<ProjectFile>
 */
class ProjectFileFactory extends Factory
{
    protected $model = ProjectFile::class;

    public function definition(): array
    {
        $path = fake()->unique()->slug().'.md';

        return [
            'project_id' => Project::factory(),
            'path' => $path,
            'size_bytes' => fake()->numberBetween(10, 50_000),
            'disk_path' => "projects/placeholder/{$path}",
        ];
    }
}
