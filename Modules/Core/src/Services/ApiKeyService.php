<?php

namespace Modules\Core\Services;

use App\Models\User;
use Illuminate\Support\Str;
use Modules\Core\Contracts\IssuesApiKeys;
use Modules\Core\Data\IssuedApiKey;
use Modules\Core\Models\ApiKey;

class ApiKeyService implements IssuesApiKeys
{
    private const string PREFIX = 'ev_';

    public function issue(User $user, string $name, array $abilities = ['*']): IssuedApiKey
    {
        $plaintext = self::PREFIX.Str::random(40);

        $apiKey = ApiKey::create([
            'user_id' => $user->id,
            'name' => $name,
            'prefix' => substr($plaintext, 0, 12),
            'hash' => $this->hash($plaintext),
            'abilities' => $abilities,
        ]);

        return new IssuedApiKey($apiKey, $plaintext);
    }

    public function resolve(string $plaintextToken): ?ApiKey
    {
        return ApiKey::query()
            ->where('hash', $this->hash($plaintextToken))
            ->whereNull('revoked_at')
            ->first();
    }

    public function revoke(ApiKey $apiKey): void
    {
        $apiKey->update(['revoked_at' => now()]);
    }

    private function hash(string $plaintextToken): string
    {
        return hash('sha256', $plaintextToken);
    }
}
