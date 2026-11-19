# Skills and connectors

The API can only read these; add new ones in the web app. Use the names in `skills` and `connectors` when you [create a task](/docs/api/tasks).

## Skills

`GET /skills?limit=&cursor=` lists the skills the agent on your computer can load. Needs a set-up computer (`409 no_computer` otherwise).

```json
{
  "ok": true, "request_id": "req_vkgOhT2rhGvDzgON",
  "data": [
    { "name": "architecture-diagram", "object": "skill", "description": "Dark-themed SVG architecture/cloud/infra diagrams as HTML.", "category": "creative", "source": "builtin", "enabled": true }
  ],
  "has_more": true, "next_cursor": "…"
}
```

`source` is `builtin`, `hub` (installed from a catalog) or `local` (written by you or the agent).

## Connectors

`GET /connectors?connected=true&limit=&cursor=` lists apps (Gmail, Calendar, Drive, …) and your custom MCP servers and APIs, with live connection status. `connected=true` keeps only connected ones. Needs an Orgo connection (`403` otherwise).

```json
{
  "ok": true, "request_id": "req_hAiCJj6krpdo_LzZ",
  "data": [
    { "slug": "gmail", "object": "connector", "name": "Gmail", "description": "Search, read, draft and send email", "category": "Communication", "type": "app", "connected": false },
    { "slug": "googlecalendar", "object": "connector", "name": "Google Calendar", "description": "Read your schedule and manage events", "category": "Productivity", "type": "app", "connected": false }
  ],
  "has_more": true, "next_cursor": "Z29vZ2xlZHJpdmU"
}
```

`type` is `app`, `mcp` or `api`.
