# Projects

Projects bundle tasks under shared instructions. Set `project_id` when you [create a task](/docs/api/tasks).

## The project object

```json
{
  "id": "00000000-0000-4000-8000-0000000000d1",
  "object": "project",
  "name": "API test project",
  "instructions": "Answer briefly.",
  "connectors": [],
  "skills": [],
  "pinned": false,
  "created_at": "2026-11-19T10:21:36.969Z",
  "updated_at": "2026-11-19T10:21:36.969Z"
}
```

## Create

`POST /projects` `{ name, instructions?, connectors?, skills?, pinned? }`. Honours `Idempotency-Key`. Unknown fields are refused.

```bash
curl -s https://<your-app-host>/api/v1/projects \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-b7f8be8093ba" \
  -d '{"name":"API test project","instructions":"Answer briefly."}'
```

Returns `201` with the project above. Sending the same request again with the same key returns the same project with `Idempotent-Replayed: true`.

## List

`GET /projects?limit=&cursor=` in sidebar order (default 50 per page).

## Get, update, delete

- `GET /projects/{id}`
- `PATCH /projects/{id}` with any of `name`, `instructions`, `connectors`, `skills`, `pinned`. Example: `{"name":"Renamed project","pinned":true}` returns the project with those values.
- `DELETE /projects/{id}` returns `{ "id": "…", "object": "project", "deleted": true }`. Its tasks stay and lose the link.
