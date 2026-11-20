<?php

namespace Modules\Automations\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Automations\Database\Factories\AutomationFactory;

class Automation extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'instructions',
        'cron_expression',
        'next_run_at',
        'is_enabled',
    ];

    protected function casts(): array
    {
        return [
            'next_run_at' => 'datetime',
            'is_enabled' => 'boolean',
        ];
    }

    protected static function newFactory(): AutomationFactory
    {
        return AutomationFactory::new();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function runs(): HasMany
    {
        return $this->hasMany(AutomationRun::class);
    }
}
