## What this changes

<!-- One or two sentences. Link the issue it closes, if any: "Closes #123". -->

## Why

## How it was tested

<!-- Commands you ran and what you checked in the app. -->

- [ ] `npm run typecheck`
- [ ] `npx eslint src`
- [ ] Offline tests (`node scripts/safe-fetch-test.mjs`, `node src/lib/observability/redact.test.mjs`)
- [ ] Tried the change in a running app

## Checklist

- [ ] No secrets, personal data, private hosts or ids in code, docs, tests or screenshots
- [ ] No `export const dynamic`, `revalidate`, `fetchCache` or `runtime` in routes or pages (see AGENTS.md)
- [ ] New database changes are in a new file under `supabase/migrations/`, server-only like the other tables
- [ ] New env values are added to `.env.example` and the README
- [ ] User-facing text reads `brand` from `src/config/brand.ts` rather than hard-coding the product name

By submitting this pull request I confirm that I have the right to contribute this work and that it is licensed
under the project's MIT License.
