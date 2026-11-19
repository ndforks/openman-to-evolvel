# API overview

With the developer API your own programs can launch agent tasks, watch them as they run, reply to the agent's questions, fetch results and files, and manage projects, automations, websites and webhooks. All of it acts on your account, using your computer, credits and plan.

Base URL: `https://<your-app-host>/api/v1`. The examples show the shape of real responses; ids, timestamps and request ids are illustrative placeholders.

## Endpoint map

| Area | Endpoints |
|---|---|
| Account | `GET /me` · `GET /usage` |
| Tasks | `POST /tasks` · `GET /tasks` · `GET /tasks/{id}` · `PATCH /tasks/{id}` · `DELETE /tasks/{id}` · `POST /tasks/{id}/stop` |
| Conversation | `POST /tasks/{id}/messages` · `GET /tasks/{id}/messages` · `GET /tasks/{id}/events` · `GET /tasks/{id}/stream` · `POST /tasks/{id}/respond` |
| Results | `GET /tasks/{id}/files` · `GET /tasks/{id}/files/{fileId}` · `GET /tasks/{id}/artifacts` |
| Projects | `GET` `POST /projects` · `GET` `PATCH` `DELETE /projects/{id}` |
| Skills, connectors | `GET /skills` · `GET /connectors` |
| Websites | `GET /websites` · `GET /websites/{id}` · `POST` `DELETE /websites/{id}/publish` |
| Automations | `GET` `POST /automations` · `GET` `PATCH` `DELETE /automations/{id}` · `POST /automations/{id}/run` |
| Webhooks | `GET` `POST /webhooks` · `GET` `PATCH` `DELETE /webhooks/{id}` · `GET /webhooks/{id}/deliveries` · `POST /webhooks/{id}/test` |

## Ground rules

- **JSON in, JSON out.** Field names are `snake_case`. Times are ISO 8601 in UTC.
- **One envelope.** Success: `{ "ok": true, "request_id": "req_…", "data": … }`. Lists add `has_more` and `next_cursor`. Failure: `{ "ok": false, "request_id": "req_…", "error": { "type", "code", "message", "param?" } }`. See [Errors](/docs/api/errors).
- **Request ids.** Each response includes an `X-Request-Id` header; mention it when asking for support.
- **Typed objects.** Every resource carries an `object` field (`task`, `project`, `webhook_endpoint`, …).

## Pagination

List endpoints take `limit` (default 20, max 100 unless the endpoint says otherwise) and `cursor`. When `has_more` is true, pass `next_cursor` back as `cursor` for the next page.

```bash
curl -s "https://<your-app-host>/api/v1/projects?limit=1" -H "Authorization: Bearer $API_KEY"
```

```json
{ "ok": true, "request_id": "req_…", "data": [ { "id": "00000000-……", "object": "project", "name": "API test project" } ], "has_more": true, "next_cursor": "MDAwMDAwMDAt…" }
```

Event and message lists page by sequence number instead: pass `after=<seq>`; `next_cursor` is the last `seq` returned.

## Idempotency

Every create (`POST /tasks`, `POST /tasks/{id}/messages`, `POST /projects`, `POST /automations`, `POST /webhooks`) accepts an `Idempotency-Key` header (up to 255 characters, kept 24 hours per account). Retrying with the same key and the same body returns the first answer with `Idempotent-Replayed: true`. The same key with a different body is a `422 idempotency_error`; a retry while the first request is still running is a `409 conflict`.

## Quick start

```bash
# 1. Create a task
curl -s https://<your-app-host>/api/v1/tasks \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"prompt":"Find three recent papers on protein folding and summarise them","mode":"standard"}'

# 2. Follow it live
curl -N https://<your-app-host>/api/v1/tasks/$TASK_ID/stream -H "Authorization: Bearer $API_KEY"

# 3. Read the result
curl -s https://<your-app-host>/api/v1/tasks/$TASK_ID/artifacts -H "Authorization: Bearer $API_KEY"
```

To avoid polling, register a [webhook](/docs/api/webhooks) instead.

## All API pages

- [Authentication](/docs/api/authentication)
- [Errors](/docs/api/errors)
- [Rate limits](/docs/api/rate-limits)
- [Tasks](/docs/api/tasks), including structured output, events, streaming, files and artifacts
- [Projects](/docs/api/projects)
- [Skills and connectors](/docs/api/skills-and-connectors)
- [Websites](/docs/api/websites)
- [Automations](/docs/api/automations)
- [Account and usage](/docs/api/account)
- [Webhooks](/docs/api/webhooks)
