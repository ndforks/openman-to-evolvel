# Authentication

## API keys

Keys are created under **Settings → Developers**. Each begins with `om_` and is displayed only once; the server keeps just its SHA-256 hash, so a lost key is gone for good. Revoke it and create another. An account can hold up to 50 keys.

Every key has **full access to your account**: it can launch tasks that spend credits, read all tasks, and edit projects, automations and webhooks. Store keys server-side only, never in browser or mobile code.

## Sending the key

```bash
curl -s https://<your-app-host>/api/v1/me -H "Authorization: Bearer $API_KEY"
```

```json
{
  "ok": true,
  "request_id": "req_niGp2jp7BXd2Gnac",
  "data": {
    "id": "dev",
    "object": "user",
    "name": "Developer",
    "email": "dev@localhost",
    "orgo_connected": true,
    "credits_balance_cents": null,
    "api_key": { "id": "00000000-0000-4000-8000-0000000000a1" },
    "rate_limit": { "requests_per_minute": 120 }
  }
}
```

Settings shows when each key was last used (refreshed at most once a minute). A revoked key stops working immediately.

## 401 and 403

| Status | `error.code` | Meaning |
|---|---|---|
| 401 | `missing_api_key` | No `Authorization` header. |
| 401 | `malformed_authorization` | The header is not `Bearer <key>`. |
| 401 | `invalid_api_key` | Unknown, mistyped or revoked key. |
| 403 | `orgo_key_missing`, `orgo_unauthorized` | The key is valid, but the account's Orgo sign-in has ended. The owner signs in to the web app again; endpoints that do not need Orgo (tasks history, projects, webhooks) keep working. |
| 403 | `plan_limit`, `insufficient_credits` | The account's plan or balance does not allow the action. |

```json
{ "ok": false, "request_id": "req_vCWNbVWbTMX4Uy4p", "error": { "type": "authentication_error", "code": "missing_api_key", "message": "No API key. Send `Authorization: Bearer <key>`." } }
```

```json
{ "ok": false, "request_id": "req_T65GmFGkNlWBxkc8", "error": { "type": "permission_denied", "code": "orgo_key_missing", "message": "Your Orgo sign-in has ended. Sign in again. (The account behind this API key has no usable Orgo connection.)" } }
```
