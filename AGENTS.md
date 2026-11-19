<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repository

Guidance for AI coding agents and for people. Read it before your first change. Setup and the pull request process are
in [CONTRIBUTING.md](CONTRIBUTING.md); the system design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

Next.js 16 (App Router, `cacheComponents` on), React 19, TypeScript, Tailwind CSS 4, Radix primitives, zustand, zod,
Supabase (Postgres, accessed only from the server), noVNC for the live desktop. The agent itself is Hermes Agent on each
user's Orgo computer, reached over HTTP from the server.

## Layout

| Path | What |
|---|---|
| `src/app/(marketing)`, `src/app/docs` | Public site and user docs (Markdown in `content/docs`, legal pages in `content/legal`) |
| `src/app/app` | The signed-in app, under the `/app` URL prefix |
| `src/app/api` | Route handlers. `api/v1` is the public API, `api/cron/tick` the scheduler, `api/webhooks` vendor callbacks |
| `src/components` | UI by area (`shell`, `task`, `computer`, `composer`, `settings`, `modals`, `pages`, `ui`, ...) |
| `src/lib/agent` | Task types (`types.ts`), browser client (`client.ts`), server relay to Hermes (`server/`) |
| `src/lib/session`, `src/lib/orgo`, `src/lib/provision` | Sign-in and sessions, the Orgo API client, home-computer setup |
| `src/lib/db` | Server-only data access, one module per area; `client.ts` holds `db()` |
| `src/config` | `brand.ts` (product name, logos, mode labels) and `usage-limits.ts` (per-user vendor caps) |
| `src/styles/tokens.css` | Design tokens (light in `:root`, dark in `.dark`) |
| `supabase/migrations` | Database schema |
| `scripts` | `setup.mjs`, `worker.mjs`, test and QA scripts |

## Commands

```bash
npm run dev                        # dev server on 127.0.0.1:3000
npx tsc --noEmit -p .              # type-check
npx eslint src                     # lint (or pass the files you changed)
node scripts/safe-fetch-test.mjs   # offline tests (CI runs these)
node src/lib/observability/redact.test.mjs
node scripts/worker.mjs --once     # one scheduler tick against APP_URL
```

Tests that need a running server, the database or live services are in `scripts/`; each file's header says what it
needs and whether it spends credits.

## Rules

- **No route segment config.** Never write `export const dynamic`, `revalidate`, `fetchCache` or `runtime` in a route
  or page. This project uses `cacheComponents`, and one such line breaks the dev server. For per-request behaviour call
  `await connection()` from `next/server` (see `src/app/api/epoch/route.ts`).
- **Server-only data.** Only server code imports `src/lib/db`. Every API route starts with `requireSession()` (or the
  public API's key check) and passes `session.userId` to the data layer; every query is scoped by it.
- **Secrets.** Never log, return or commit a secret, and never expose one as `NEXT_PUBLIC_*`. Store per-user secrets
  sealed with `seal()` from `src/lib/crypto.ts`. Send secrets to a user's computer as a staged file
  (`src/lib/orgo/secret-file.ts`), never inside a shell command.
- **User URLs.** Fetch any URL that comes from a user or an agent with `safeFetch` (`src/lib/net/safe-fetch.ts`).
- **Shell input.** Values that reach bash on a user's computer go through the existing quoting helpers, regex checks
  or base64; never interpolate raw input.
- **Database changes.** Add a new file in `supabase/migrations/`; never edit an applied migration. New tables enable
  row-level security, revoke everything from `anon` and `authenticated`, grant `select, insert, update, delete` to
  `anon`, and add the single `server only` policy on `(select private.is_server())`. A table with a person column
  (`user_id`, `owner_id`, `member_id`, ...) must also be added to account export and deletion in
  `src/lib/personalization/account-data.ts` (`scripts/account-data-test.mjs` fails otherwise).
- **Branding.** Read the product name, logos and mode labels from `brand` in `src/config/brand.ts`; never hard-code
  them. The public URL and mail domain come from env (`APP_PUBLIC_URL`, `AGENTMAIL_DOMAIN`).
- **Offer only what works.** Do not render disabled, struck-through or "coming soon" options for things the
  deployment cannot do; leave them out or explain how to enable them.
- **Env values.** A new environment value goes into `.env.example` (with a one-line description) and, if users set
  it, the README.
- **Imports before importers.** When adding a module that another file imports, create it first; a missing module
  breaks the running dev server.

## Conventions

- UI talks to the backend through `src/lib/agent/client.ts` and the routes under `/api`; shared types live in
  `src/lib/agent/types.ts`.
- Modals and panels open with `useUI().open(name)` from `src/lib/ui-store.ts`.
- Colours and spacing come from the tokens in `src/styles/tokens.css`, used as `bg-[var(--background-gray-main)]`,
  `text-[var(--text-primary)]` and so on. The signed-in app renders dark by default.
- Fonts: body text uses the system sans stack (`font-sans`); serif headings use Libre Baskerville (`font-serif`).
- Icons: `lucide-react`. Third-party logos: `public/brands/*.svg` (trademarks of their owners; identify integrations
  only).
- Copy is short, plain and specific. Errors tell the user what happened and what to do next.
- Keep dependencies to what is in `package.json`; propose new ones in the pull request.
- Server code logs through `logEvent` from `src/lib/observability/log.ts`, which redacts secrets and hashes user ids.
