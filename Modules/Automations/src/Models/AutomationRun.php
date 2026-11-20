<?php

namespace Modules\Automations\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Automations\Data\AutomationRunStatus;
use Modules\Automations\Database\Factories\AutomationRunFactory;

class AutomationRun extends Model
{
    use HasFactory;

    protected $fillable = [
        'automation_id',
        'status',
        'started_at',
        'finished_at',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'status' => AutomationRunStatus::class,
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    protected static function newFactory(): AutomationRunFactory
    {
        return AutomationRunFactory::new();
    }

    public function automation(): BelongsTo
    {
        return $this->belongsTo(Automation::class);
    }
}
