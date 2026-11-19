# Websites

Websites the agent has built for you. Ask for a site in a task to create one, then manage it with these endpoints.

## The website object

```json
{
  "id": "00000000-0000-4000-8000-0000000000e1",
  "object": "website",
  "name": "Fog City Bagels",
  "status": "unpublished",
  "visibility": "public",
  "preview_url": null,
  "published_url": null,
  "published_at": "2026-11-19T09:18:27.843Z",
  "task_id": "tsk0000000000000000003",
  "task_ids": ["tsk0000000000000000003"],
  "error": null,
  "created_at": "2026-11-19T09:14:39.197Z",
  "updated_at": "2026-11-19T09:45:28.435Z"
}
```

`status` is one of `building`, `ready`, `draft`, `publishing`, `published`, `failed`, `unpublished`.

## List

`GET /websites?limit=&cursor=`, newest first.

## Status

`GET /websites/{id}` checks the site on your computer and returns it with `preview` (the live preview state). `?sync=false` skips the check and answers from the stored record (the example above, with `"preview": null`).

## Publish and unpublish

- `POST /websites/{id}/publish` builds the current version and serves it at `published_url`. Returns the website. Can take a minute.
- `DELETE /websites/{id}/publish` removes the public URL.

Unknown ids answer `404 not_found`.
