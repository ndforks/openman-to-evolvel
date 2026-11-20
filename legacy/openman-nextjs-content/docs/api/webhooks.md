# Webhooks

Register an endpoint and the server sends it a signed JSON event whenever something happens, so you never need to poll.

## Events

| Event | When |
|---|---|
| `task.created` | A task was created (through the API, the web app or an automation). |
| `task.completed` | A run finished. For tasks with `output_schema`, sent once the structured output is ready (or has failed), with it included. |
| `task.failed` | A run failed. |
| `task.stopped` | A run was stopped. |
| `task.needs_input` | The task is waiting for an answer or an approval. |
| `task.deleted` | A task was deleted through the API. |
| `ping` | Sent by `POST /webhooks/{id}/test`. |

Endpoints made in **Settings → Developers** subscribe to `task.created`, `task.stopped` and `task.deleted`. For them, `task.stopped` means "stopped running for any reason" and also delivers `task.completed`, `task.failed` and `task.needs_input`. An endpoint that lists any of those three, or `*`, is matched exactly.

## Managing endpoints

- `POST /webhooks` `{ "url": "https://…", "events": ["task.completed", "task.failed"] }` (default `["*"]`). Returns the signing `secret` **once**. Honours `Idempotency-Key`. Up to 20 endpoints.
- `GET /webhooks`, `GET /webhooks/{id}` (never include the secret).
- `PATCH /webhooks/{id}` `{ url?, events?, enabled?, roll_secret? }`. With `"roll_secret": true` the new secret is returned once and the old one stops working at once.
- `DELETE /webhooks/{id}` removes it and its delivery history.
- `POST /webhooks/{id}/test` sends a `ping`.
- `GET /webhooks/{id}/deliveries?limit=&cursor=` shows each delivery, newest first.

```bash
curl -s https://<your-app-host>/api/v1/webhooks \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/hooks/agent","events":["*"]}'
```

```json
{
  "ok": true, "request_id": "req_qkt4NFSxLnPwmN5w",
  "data": { "id": "00000000-0000-4000-8000-0000000000c1", "object": "webhook_endpoint", "url": "https://example.com/hooks/agent", "events": ["*"], "enabled": true, "created_at": "2026-11-19T10:21:39.955Z", "updated_at": "2026-11-19T10:21:39.955Z", "secret": "whsec_••••" }
}
```

URLs must be `https://` and public. (While developing, plain `http://` to `localhost` or `127.0.0.1` is accepted.)

## The request we send

```http
POST /hooks/agent HTTP/1.1
Content-Type: application/json
Webhook-Id: evt_000000000000000000000001
Webhook-Timestamp: 1795083735
Webhook-Signature: v1=5c0b…(64 hex)
Webhook-Event: task.completed
Webhook-Attempt: 1
```

```json
{
  "id": "evt_000000000000000000000001",
  "object": "event",
  "type": "task.completed",
  "created_at": "2026-11-19T10:22:15.402Z",
  "data": {
    "seq": 13,
    "task": {
      "id": "tsk0000000000000000001", "object": "task",
      "title": "Reply with the word PONG and the number 42, in one short…",
      "status": "completed", "mode": "lite", "effort": null, "project_id": null,
      "favorite": false, "archived": false, "source": "api",
      "url": "https://<your-app-host>/app/task/tsk0000000000000000001",
      "created_at": "2026-11-19T10:22:07.826Z", "updated_at": "2026-11-19T10:22:14.840Z",
      "structured_output": { "status": "ready", "value": { "word": "PONG", "number": 42 }, "error": null }
    },
    "result": { "message": "PONG, and the number is 42." }
  }
}
```

`data.task` is the [task object](/docs/api/tasks). Per event, `data` also has: `result.message` (completed), `error.message` and `brief` (failed), `pending_request` (needs_input), `seq` (the event that caused it). A `task.failed` example:

```json
{
  "id": "evt_000000000000000000000002", "object": "event", "type": "task.failed", "created_at": "2026-11-19T10:21:54.255Z",
  "data": {
    "seq": 3,
    "task": { "id": "tsk0000000000000000002", "object": "task", "title": "Say hello", "status": "failed", "mode": "lite", "source": "api", "…": "…" },
    "brief": "Your agent computer isn't set up yet. Open Computers to create it, then try again.",
    "error": { "message": "Your agent computer isn't set up yet. Open Computers to create it, then try again." }
  }
}
```

`Webhook-Id` equals the event `id` and stays the same across retries: use it to ignore duplicates.

## Verifying the signature

`Webhook-Signature` is `v1=` plus the hex HMAC-SHA256 of `"<Webhook-Timestamp>.<raw body>"`, keyed with the endpoint's secret (the whole `whsec_…` string). Verify against the **raw** body, compare in constant time, and reject timestamps more than 5 minutes from now so a captured request cannot be replayed.

### JavaScript (Node.js)

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(secret, headers, rawBody, toleranceSeconds = 300) {
  const timestamp = Number(headers["webhook-timestamp"]);
  const signature = String(headers["webhook-signature"] ?? "");
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = "v1=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Express: keep the raw body.
// app.post("/hooks/agent", express.raw({ type: "application/json" }), (req, res) => {
//   if (!verifyWebhook(process.env.WEBHOOK_SECRET, req.headers, req.body.toString("utf8"))) return res.sendStatus(400);
//   const event = JSON.parse(req.body);
//   res.sendStatus(200);
// });
```

### Python

```python
import hashlib, hmac, time

def verify_webhook(secret: str, headers: dict, raw_body: bytes, tolerance_seconds: int = 300) -> bool:
    try:
        timestamp = int(headers["webhook-timestamp"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - timestamp) > tolerance_seconds:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = "v1=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(headers.get("webhook-signature", ""), expected)

# Flask:
# @app.post("/hooks/agent")
# def hook():
#     if not verify_webhook(os.environ["WEBHOOK_SECRET"], {k.lower(): v for k, v in request.headers.items()}, request.get_data()):
#         abort(400)
#     event = request.get_json()
#     return "", 200
```

## Delivery and retries

Answer with any `2xx` within 10 seconds; do slow work after replying. Anything else (another status, a timeout, a refused connection) is retried with backoff: after 10 s, 1 min, 5 min, 30 min, 2 h and 6 h, so 7 attempts over about 9 hours, then the delivery is marked `failed`. Redirects are not followed.

Every attempt is logged:

```json
{
  "id": "00000000-0000-4000-8000-0000000000c2", "object": "webhook_delivery",
  "webhook_id": "00000000-0000-4000-8000-0000000000c3", "event_id": "evt_000000000000000000000003", "event_type": "ping",
  "status": "delivered", "attempts": 2, "next_attempt_at": null, "last_status_code": 200, "last_error": null,
  "delivered_at": "2026-11-19T10:21:52.766Z", "created_at": "2026-11-19T10:21:41.552Z",
  "payload": { "id": "evt_000000000000000000000003", "object": "event", "type": "ping", "created_at": "2026-11-19T10:21:41.520Z", "data": { "message": "This is a test event.", "webhook_id": "00000000-0000-4000-8000-0000000000c3" } }
}
```

(That endpoint answered `500` the first time and `200` on the retry 10 seconds later.)

Events are usually sent within seconds. Order is not guaranteed; use `data.seq` and `data.task.updated_at` to order events for the same task.
