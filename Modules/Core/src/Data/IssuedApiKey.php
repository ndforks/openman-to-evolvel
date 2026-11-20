<?php

namespace Modules\Core\Data;

use Modules\Core\Models\ApiKey;

/**
 * The one moment the plaintext token exists outside the request that minted
 * it. Nothing persists this class; `plaintextToken` must never be logged.
 */
final readonly class IssuedApiKey
{
    public function __construct(
        public ApiKey $apiKey,
        public string $plaintextToken,
    ) {}
}
