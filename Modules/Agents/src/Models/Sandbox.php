<?php

namespace Modules\Agents\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Modules\Agents\Data\SandboxStatus;
use Modules\Agents\Database\Factories\SandboxFactory;

class Sandbox extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'repository_path',
        'worktree_path',
        'branch',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'status' => SandboxStatus::class,
        ];
    }

    protected static function newFactory(): SandboxFactory
    {
        return SandboxFactory::new();
    }
}
