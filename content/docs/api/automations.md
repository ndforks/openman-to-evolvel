# Automations

Automations are prompts that run on a timetable or in response to an event (a webhook call, a new feed item, an email). Every run starts an ordinary task.

## Create

`POST /automations`. Body fields are `snake_case`:

| Field | |
|---|---|
| `prompt` | Required. What the agent does each run. |
| `name` | Optional. |
| `kind` | `schedule` (default), `trigger` or `advanced`. |
| `repeat` | `{ "freq": "daily", "time": "09:00" }`, `weekdays`, `weekly` (`days: [0-6]`), `monthly` (`dates: [1-31]`), `once` (`date`), `interval` (`every_minutes`). |
| `timezone` | IANA name, default `UTC`. |
| `ends_at` | Optional ISO time. |
| `triggers` | `[{ "type": "webhook" | "rss" | "email" | "timer", … }]`. |
| `mode`, `project_id`, `connectors`, `run_in` (`new` or `same`), `enabled` | Optional. |

Honours `Idempotency-Key`. Plan limits on active automations apply (`403 plan_limit`).

```bash
curl -s https://<your-app-host>/api/v1/automations \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"API test automation","prompt":"Summarise the news","repeat":{"freq":"daily","time":"09:00"},"timezone":"UTC","enabled":false}'
```

```json
{
  "ok": true, "request_id": "req_j60Qt2n75rl6BUog",
  "data": {
    "object": "automation", "id": "00000000-0000-4000-8000-0000000000b1",
    "name": "API test automation", "kind": "schedule", "prompt": "Summarise the news",
    "repeat": { "freq": "daily", "time": "09:00" }, "timezone": "UTC", "ends_at": null,
    "triggers": [], "mode": "standard", "run_in": "new", "project_id": null, "connectors": [],
    "enabled": false, "paused_reason": null, "failure_count": 0, "task_id": null, "source_task_id": null,
    "last_run_at": null, "next_run_at": null, "describe": "Every day at 9:00 AM", "last_run": null,
    "created_at": "2026-11-19T10:22:03.229Z", "updated_at": "2026-11-19T10:22:03.229Z"
  }
}
```

## List, get

- `GET /automations?limit=&cursor=`: newest first, each with `last_run`.
- `GET /automations/{id}`

## Update

`PATCH /automations/{id}`. `{ "enabled": false }` alone pauses (or `true` resumes). Any other fields are merged into the current settings and validated like a create, e.g. `{"name":"Renamed automation","repeat":{"freq":"weekly","days":[1],"time":"08:30"}}`.

## Delete

`DELETE /automations/{id}` returns `{ "id": "…", "object": "automation", "deleted": true }`.

## Run now

`POST /automations/{id}/run` runs it at once, even while paused. Not retried and not counted toward auto-pause. Returns `202` with the run; `task_id` is the task it started. (Sample from an account with no computer set up yet, so the run fails at once:)

```json
{
  "ok": true, "request_id": "req_Q9CHiCKwV3ZSI3W7",
  "data": {
    "object": "automation_run", "id": "00000000-0000-4000-8000-0000000000b2",
    "automation_id": "00000000-0000-4000-8000-0000000000b1", "task_id": null,
    "status": "failed", "trigger": "test", "summary": null,
    "error": "Your agent computer isn't set up yet. Open Computers to create it, then try again.",
    "attempt": 1, "scheduled_for": null, "started_at": "2026-11-19T10:22:04.298Z", "finished_at": null
  }
}
```
