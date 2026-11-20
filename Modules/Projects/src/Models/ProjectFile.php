<?php

namespace Modules\Projects\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Projects\Database\Factories\ProjectFileFactory;

class ProjectFile extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'path',
        'size_bytes',
        'disk_path',
    ];

    protected static function newFactory(): ProjectFileFactory
    {
        return ProjectFileFactory::new();
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
