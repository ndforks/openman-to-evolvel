<?php

namespace Modules\Tasks\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Tasks\Database\Factories\TaskEventFactory;

class TaskEvent extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'type',
        'data',
        'sequence',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
        ];
    }

    protected static function newFactory(): TaskEventFactory
    {
        return TaskEventFactory::new();
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}
