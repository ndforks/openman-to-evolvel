<?php

return [

    /*
    |--------------------------------------------------------------------------
    | OpenCode binary
    |--------------------------------------------------------------------------
    |
    | Path to the `opencode` executable (the `opencode-ai` CLI) that
    | Modules\Agents\Services\OpenCodeAgentRuntime drives. Defaults to
    | relying on PATH; override it in deployments where opencode is
    | installed somewhere PHP's process environment won't find on its own.
    |
    */
    'opencode_binary' => env('OPENCODE_BINARY', 'opencode'),

];
