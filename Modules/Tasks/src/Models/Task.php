<?php

namespace Modules\Tasks\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Tasks\Data\TaskStatus;
use Modules\Tasks\Database\Factories\TaskFactory;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'project_id',
        'title',
        'status',
        'instructions',
        'workspace_path',
        'started_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => TaskStatus::class,
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    protected static function newFactory(): TaskFactory
    {
        return TaskFactory::new();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(TaskEvent::class)->orderBy('sequence');
    }

    public function files(): HasMany
    {
        return $this->hasMany(TaskFile::class);
    }

    public function members(): HasMany
    {
        return $this->hasMany(TaskMember::class);
    }

    public function isFinished(): bool
    {
        return $this->status->isTerminal();
    }
}
