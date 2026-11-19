# Tasks

A task is a single job for the agent. It runs on your home computer, keeps one session throughout (so follow-ups have full context), and logs each step as a numbered event.

## The task object

```json
{
  "id": "tsk0000000000000000001",
  "object": "task",
  "title": "Reply with the word PONG and the number 42, in one short…",
  "status": "completed",
  "mode": "lite",
  "effort": null,
  "project_id": null,
  "favorite": false,
  "archived": false,
  "source": "api",
  "url": "https://<your-app-host>/app/task/tsk0000000000000000001",
  "created_at": "2026-11-19T10:22:07.826Z",
  "updated_at": "2026-11-19T10:22:14.840Z",
  "structured_output": { "status": "ready", "value": { "word": "PONG", "number": 42 }, "error": null },
  "last_seq": 14,
  "pending_request": null
}
```

| Field | Notes |
|---|---|
| `status` | `starting` → `running` → `completed`, `failed` or `stopped`. `waiting` means it needs your answer (see `pending_request`). |
| `source` | `api` for tasks made through the API, `app` for the rest. |
| `url` | The task in the web app, where it can be watched live. |
| `structured_output` | Only when the task was created with `output_schema`. `status` is `pending`, `ready` or `failed`. |
| `last_seq`, `pending_request` | Only on `GET /tasks/{id}`. |

## Create a task

`POST /tasks`

| Field | Type | |
|---|---|---|
| `prompt` | string, required | What to do. |
| `mode` | `lite` · `standard` · `max` · `flex` | Picks the model. Default `standard`. |
| `effort` | `medium` · `high` · `extra` · `ultra` | Optional. |
| `project_id` | string | Applies the project's instructions. |
| `connectors` | string[] | Connector slugs from [`GET /connectors`](/docs/api/skills-and-connectors). |
| `skills` | string[] | Skill names from [`GET /skills`](/docs/api/skills-and-connectors); the agent is told to use them. |
| `attachments` | `[{ url, name? }]` | Files by http(s) URL; the agent downloads them. |
| `output_schema` | JSON Schema object | Ask for a validated JSON result. See below. |

Honours `Idempotency-Key`. Returns `201` at once with `status: "starting"`.

```bash
curl -s https://<your-app-host>/api/v1/tasks \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: dev-83feb0a1" \
  -d '{
    "prompt": "Reply with the word PONG and the number 42, in one short sentence. Do not use any tools.",
    "mode": "lite",
    "output_schema": {
      "type": "object",
      "properties": { "word": { "type": "string" }, "number": { "type": "number" } },
      "required": ["word", "number"],
      "additionalProperties": false
    }
  }'
```

```json
{
  "ok": true,
  "request_id": "req_DyYD8wULTwL3ikZh",
  "data": {
    "id": "tsk0000000000000000001", "object": "task",
    "title": "Reply with the word PONG and the number 42, in one short…",
    "status": "starting", "mode": "lite", "effort": null, "project_id": null,
    "favorite": false, "archived": false, "source": "api",
    "url": "https://<your-app-host>/app/task/tsk0000000000000000001",
    "created_at": "2026-11-19T10:22:07.826Z", "updated_at": "2026-11-19T10:22:07.826Z",
    "structured_output": { "status": "pending", "value": null, "error": null }
  }
}
```

### Structured output

With `output_schema`, when the task's work is done the agent gets one more turn in the same session: reply with only a JSON value matching the schema. That reply is parsed and validated against your schema. The result appears in `structured_output` on the task, in the `task.completed` [webhook](/docs/api/webhooks) (sent only after this step, so you get one event with the value), and as a `json` artifact. If the reply does not validate, `structured_output.status` is `failed` with the reason in `error`; the task itself still completes. This costs one extra short model call, and the extra turn is visible in the task's messages.

An unusable schema is refused up front with `400 invalid_output_schema`.

## Get a task

`GET /tasks/{id}` returns the task with `last_seq` and `pending_request`. Example: the object at the top of this page.

## List tasks

`GET /tasks?status=&project_id=&archived=&limit=&cursor=`. Newest first. `status` takes the public values above; `archived` is `false` (default), `true` or `all`.

```bash
curl -s "https://<your-app-host>/api/v1/tasks?limit=1&status=failed" -H "Authorization: Bearer $API_KEY"
```

```json
{
  "ok": true, "request_id": "req_olHgygKEKY_2Tnzd",
  "data": [ { "id": "tsk0000000000000000002", "object": "task", "title": "Renamed by API", "status": "failed", "mode": "lite", "effort": null, "project_id": "00000000-0000-4000-8000-0000000000d1", "favorite": true, "archived": false, "source": "api", "url": "https://<your-app-host>/app/task/tsk0000000000000000002", "created_at": "2026-11-19T10:21:53.350Z", "updated_at": "2026-11-19T10:21:55.751Z" } ],
  "has_more": false, "next_cursor": null
}
```

## Update a task

`PATCH /tasks/{id}` with any of `title`, `favorite`, `archived`, `project_id` (`null` removes it from its project).

```bash
curl -s -X PATCH https://<your-app-host>/api/v1/tasks/tsk0000000000000000002 \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Renamed by API","favorite":true}'
```

Returns the updated task.

## Stop a task

`POST /tasks/{id}/stop` stops the current run and drops queued messages. Returns the task. Stopping a finished task leaves it as it is.

## Delete a task

`DELETE /tasks/{id}` stops it if running, then deletes it with its events and files. Sends `task.deleted`.

```json
{ "ok": true, "request_id": "req_ypzc68H4uAnqgyr5", "data": { "id": "tsk0000000000000000002", "object": "task", "deleted": true } }
```

## Send a message

`POST /tasks/{id}/messages` `{ "text": "...", "mode": "queue" | "steer" | "interrupt" }`

- `queue` (default): runs after the current run ends.
- `steer`: handed to the running agent at its next step.
- `interrupt`: stops the current run and starts over with this message.

When nothing is running, every mode starts a new run. Honours `Idempotency-Key`.

```json
{ "ok": true, "request_id": "req_yCYBkbsZ0ml5o9NJ", "data": { "task_id": "tsk0000000000000000002", "accepted": true, "mode": "queue" } }
```

## List messages

`GET /tasks/{id}/messages?after=<seq>&limit=` (max 500): the conversation, oldest first.

```json
{
  "ok": true, "request_id": "req_biy7pDL22h72zEJF",
  "data": [
    { "id": "msg_1", "seq": 1, "role": "user", "text": "Reply with the word PONG and the number 42, in one short sentence. Do not use any tools.", "created_at": "2026-11-19T10:22:07.912Z" },
    { "id": "msg_5", "seq": 5, "role": "assistant", "text": "PONG, and the number is 42.", "created_at": "2026-11-19T10:22:10.237Z" }
  ],
  "has_more": false, "next_cursor": null
}
```

## Answer a question or approval

When `status` is `waiting`, `pending_request` says what the agent needs:

```json
{ "request_id": "…", "kind": "question", "text": "Which city?", "options": ["Paris", "Rome"], "multiple": false, "seq": 12 }
```

or `{ "kind": "approval", "text": "…", "detail": "…", "choices": ["…"] }`. Reply with

`POST /tasks/{id}/respond` `{ "request_id": "…", "answer": "Paris" }` for a question, or `{ "request_id": "…", "choice": "<one of choices>" }` for an approval. A request that is no longer pending answers `409 request_not_pending`. You can also be told by the `task.needs_input` webhook.

## Events

`GET /tasks/{id}/events?after=<seq>&limit=&types=` (max 1000): the full log, oldest first. Each event is `{ seq, type, at, data }`. `types` filters, e.g. `types=status,message.completed`.

```json
{
  "ok": true, "request_id": "req_JjfZ7bbhsusyBzpa",
  "data": [
    { "seq": 1, "type": "user.message", "at": "2026-11-19T10:21:53.437Z", "data": { "text": "Say hello" } },
    { "seq": 2, "type": "status", "at": "2026-11-19T10:21:53.437Z", "data": { "status": "starting", "brief": "Starting the computer" } }
  ],
  "has_more": true, "next_cursor": "2"
}
```

| `type` | `data` |
|---|---|
| `user.message` | `text` |
| `message.delta`, `reasoning.delta` | `text` (streamed pieces) |
| `message.completed` | `text` |
| `tool.started` | `call_id`, `tool`, `preview?` |
| `tool.completed` | `call_id`, `tool`, `preview?`, `error?`, `duration_ms?` |
| `plan.updated` | `steps: [{ title, status }]` |
| `approval.request` | `request_id`, `kind`, `title`, `detail?`, `choices` |
| `question` | `request_id`, `text`, `options?`, `multiple?` |
| `file.created` | `file_id`, `name`, `mime?`, `size?` |
| `status` | `status`, `brief?` |
| `run.completed` | `usage?: { input_tokens, output_tokens }` |
| `run.failed` | `error` |

## Stream

`GET /tasks/{id}/stream?after=<seq>` is Server-Sent Events. It replays events after `after` (or the `Last-Event-ID` header on reconnect), then sends new ones as they happen. When the task is at rest it sends `event: end` with the final status and closes; open a new stream after sending a follow-up.

```bash
curl -N https://<your-app-host>/api/v1/tasks/tsk0000000000000000001/stream -H "Authorization: Bearer $API_KEY"
```

```text
id: 2
event: status
data: {"seq":2,"type":"status","at":"2026-11-19T10:22:07.912Z","data":{"status":"starting","brief":"Starting the computer"}}

id: 3
event: status
data: {"seq":3,"type":"status","at":"2026-11-19T10:22:08.618Z","data":{"status":"running"}}

id: 5
event: message.completed
data: {"seq":5,"type":"message.completed","at":"2026-11-19T10:22:10.237Z","data":{"text":"PONG, and the number is 42."}}

id: 6
event: status
data: {"seq":6,"type":"status","at":"2026-11-19T10:22:10.237Z","data":{"status":"completed"}}

event: end
data: {"status":"completed"}
```

A `: keepalive` comment goes out every 15 seconds.

## Files

`GET /tasks/{id}/files` lists files the agent wrote or delivered, oldest first:

```json
{ "id": "file_ab12…", "object": "file", "task_id": "…", "name": "report.pdf", "mime": "application/pdf", "size": 48213, "created_at": "…", "download_url": "https://<your-app-host>/api/v1/tasks/…/files/file_ab12…" }
```

`GET /tasks/{id}/files/{fileId}` returns the bytes as an attachment (send the same `Authorization` header).

## Artifacts

`GET /tasks/{id}/artifacts` gathers what the task produced: the final answer (`type: "message"`), the structured output (`type: "json"`, when ready) and every file (`type: "file"`, with `download_url`).

```json
{
  "ok": true, "request_id": "req_NyTmIUspyPeHG3EZ",
  "data": [
    { "id": "art_msg_5", "object": "artifact", "type": "message", "text": "PONG, and the number is 42.", "created_at": "2026-11-19T10:22:10.237Z" },
    { "id": "art_json_tsk0000000000000000001", "object": "artifact", "type": "json", "value": { "word": "PONG", "number": 42 } }
  ],
  "has_more": false, "next_cursor": null
}
```
