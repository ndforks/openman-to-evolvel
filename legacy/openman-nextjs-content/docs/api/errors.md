# Errors

Errors share one structure and come with the matching HTTP status:

```json
{
  "ok": false,
  "request_id": "req_NnTLBS_Bd6wuAfAB",
  "error": {
    "type": "invalid_request",
    "code": "invalid_parameter",
    "message": "prompt: Invalid input: expected string, received undefined",
    "param": "prompt"
  }
}
```

- `type` is the broad category; use it in your error handling.
- `code` is the precise reason; it is stable, so it is safe to match on as well.
- `message` is human-readable text and may change.
- `param`, when present, names the offending field or header.

## Types

| HTTP | `type` | Typical `code` values |
|---|---|---|
| 400 | `invalid_request` | `invalid_json`, `invalid_parameter`, `invalid_cursor`, `invalid_output_schema`, `invalid_url`, `limit_reached` |
| 401 | `authentication_error` | `missing_api_key`, `malformed_authorization`, `invalid_api_key` |
| 403 | `permission_denied` | `orgo_key_missing`, `orgo_unauthorized`, `plan_limit`, `insufficient_credits` |
| 404 | `not_found` | `resource_not_found`, `project_not_found` |
| 409 | `conflict` | `request_not_pending`, `idempotency_in_progress`, `no_computer` |
| 422 | `idempotency_error` | `idempotency_key_reused` |
| 429 | `rate_limited` | `rate_limit_exceeded`, `upstream_rate_limited` |
| 500 | `internal_error` | `internal_error` |
| 502, 503 | `upstream_error` | `orgo_unavailable`, `storage_unavailable`, `file_unavailable` |

## Examples

Unknown task:

```json
{ "ok": false, "request_id": "req_…", "error": { "type": "not_found", "code": "resource_not_found", "message": "Task not found." } }
```

Answering a question the task is no longer waiting on:

```json
{ "ok": false, "request_id": "req_pgZLMcETkBaGW7U6", "error": { "type": "conflict", "code": "request_not_pending", "message": "This request is no longer waiting for an answer.", "param": "request_id" } }
```

Reusing an idempotency key with a different body:

```json
{ "ok": false, "request_id": "req_N7BesACqTSbR4lL3", "error": { "type": "idempotency_error", "code": "idempotency_key_reused", "message": "This Idempotency-Key was already used with a different request.", "param": "Idempotency-Key" } }
```

## Retrying

Use backoff to retry `429`, `502`, `503` and network errors, and include an `Idempotency-Key` on create calls so a retry cannot create a duplicate. Other `4xx` responses need a changed request before you try again.
