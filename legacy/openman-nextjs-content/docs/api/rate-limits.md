# Rate limits

An API key is allowed **120 requests per minute**, counted in a fixed window that restarts at the top of each UTC minute. Each key has its own count, and an open `/stream` connection counts once.

Each response reports where you stand:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Requests allowed per window. |
| `X-RateLimit-Remaining` | Requests left in this window. |
| `X-RateLimit-Reset` | When the window resets, as Unix seconds. |
| `Retry-After` | Only on a 429: seconds to wait. |

Requests beyond the limit get a `429`:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 41
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
```

```json
{ "ok": false, "request_id": "req_jwJmlqlXd2FuAhP5", "error": { "type": "rate_limited", "code": "rate_limit_exceeded", "message": "Too many requests: this key may make 120 requests per minute. Retry after 41 s." } }
```

Rather than polling, use [webhooks](/docs/api/webhooks) or the [event stream](/docs/api/tasks#stream).
