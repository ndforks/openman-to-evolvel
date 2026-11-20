<?php

namespace Modules\Core\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Core\Database\Factories\WebhookFactory;

class Webhook extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'url',
        'sealed_secret',
        'events',
        'is_active',
    ];

    protected $hidden = [
        'sealed_secret',
    ];

    protected function casts(): array
    {
        return [
            'events' => 'array',
            'is_active' => 'boolean',
        ];
    }

    protected static function newFactory(): WebhookFactory
    {
        return WebhookFactory::new();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class);
    }

    public function listensFor(string $event): bool
    {
        return $this->is_active && in_array($event, $this->events ?? [], true);
    }
}
