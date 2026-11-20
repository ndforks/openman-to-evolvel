# Contributing to OpenMan

Thanks for helping. Bug reports, fixes, docs and features are all welcome.

## Before you start

- **Security problems** go through private reporting, never a public issue: see [SECURITY.md](SECURITY.md).
- For anything bigger than a small fix, open an issue first so we can agree on the approach before you spend time.
- Be kind: this project follows the [code of conduct](CODE_OF_CONDUCT.md).

## Set up

Follow "Quick start" in the [README](README.md): Node.js 22, a Supabase project with the migrations applied,
`node scripts/setup.mjs`, then `npm run dev`. For most UI work you can run with `OPENMAN_DEV_BYPASS=1` and your
own Orgo API key, which signs you in as a local development user (loopback only, never in production).

[AGENTS.md](AGENTS.md) describes the layout of the code and the conventions. It applies to people and to AI coding
agents alike; read it before your first change.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Keep the change focused. Unrelated refactors make review slower.
3. Match the surrounding style. User-facing text is short and plain, and reads the product name from
   `src/config/brand.ts`.
4. Database changes go in a new file under `supabase/migrations/` (never edit an existing migration). New tables are
   server-only like the others: row-level security on, a single `server only` policy on `private.is_server()`.
5. A new environment value needs an entry in `.env.example` and, if users set it, the README.
6. Never commit secrets, `.env.local`, personal data, private hostnames or ids, or screenshots that show any of these.

## Tests

Always, before opening a pull request (CI runs these too, plus a production build):

```bash
npm run typecheck        # next typegen (route types) + tsc; plain `npx tsc --noEmit -p .` works once Next has run
npx eslint src
node scripts/safe-fetch-test.mjs
node src/lib/observability/redact.test.mjs
```

Tests that need a running dev server, a database or live services live in `scripts/` (`auth-hardening-test.mjs`, `signin-test.mjs`,
`db-rls-check.mjs`, `xss-test.mjs`, `api-test.mjs --no-agent`, `account-data-test.mjs`, the `qa-*.mjs` browser
scenarios and others). Each file's header says what it needs. Most read `.env.local` and expect the dev server on the
URL given by `BASE_URL` (several default to `http://127.0.0.1:3001`; pass `BASE_URL=http://127.0.0.1:3000` if you run on
the default port). Some create real tasks on your Orgo computer and spend credits: read the header before running one.
Run the ones that cover the area you changed and say which in the pull request.

## Pull requests

- Fill in the pull request template: what changed, why, and how you tested it.
- Keep commits readable; we usually squash on merge.
- A maintainer will review. Changes to authentication, the database gate, secret handling or anything that spends a
  user's money get a closer look and may take longer.

## Licence of contributions

OpenMan is released under the [MIT License](LICENSE). By submitting a contribution you confirm that you wrote it or
otherwise have the right to submit it, and you agree that it is licensed under the MIT License as part of the project
(inbound = outbound). Do not submit code copied from projects under incompatible licences.

The OpenMan and Orgo names and logos are not covered by the MIT License; see [TRADEMARKS.md](TRADEMARKS.md).
