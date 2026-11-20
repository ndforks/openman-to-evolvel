<?php

namespace Modules\Tasks\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Tasks\Database\Factories\TaskFileFactory;

class TaskFile extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'path',
        'size_bytes',
        'disk_path',
    ];

    protected static function newFactory(): TaskFileFactory
    {
        return TaskFileFactory::new();
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}
