<?php

namespace Modules\Core\Contracts;

use App\Models\User;
use Modules\Core\Data\IssuedApiKey;
use Modules\Core\Models\ApiKey;

interface IssuesApiKeys
{
    /**
     * Mint a new key for the user. The plaintext token is returned once and
     * never stored — only its SHA-256 hash is persisted (OpenMan's documented
     * `om_` key design, carried over as an `ev_`-prefixed one).
     */
    public function issue(User $user, string $name, array $abilities = ['*']): IssuedApiKey;

    /**
     * Resolve a presented plaintext token back to its (non-revoked) key, or
     * null when it does not match any stored hash or has been revoked.
     */
    public function resolve(string $plaintextToken): ?ApiKey;

    public function revoke(ApiKey $apiKey): void;
}
