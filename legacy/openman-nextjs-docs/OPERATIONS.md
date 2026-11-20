# Operator guide

For whoever runs an OpenMan deployment. Deployment itself is in [deploy.md](deploy.md); the security design is in
[security-model.md](security-model.md). Never paste a secret into a command line that is logged or shared: read it
from a file into a variable instead.

## What watches the service

| Signal | Where | Who can see it |
|---|---|---|
| Liveness | `GET /api/health` (no auth, no database) | anyone |
| Readiness | `GET /api/health/deep` with `Authorization: Bearer $CRON_SECRET`: database, database gate, scheduler tick age, webhook queue, failing automations, stuck provisioning, sign-in budget, error counts, which settings are present. 200 when serving, 503 when not. | operator |
| Operator page | `/app/admin`: the deep check, sign-ups, provisioning outcomes, tasks per day, failure rate, model cost per task kind, recent warnings and errors with request ids, the invite list | the invite-list owner, `OPERATOR_USER_IDS`, the development user locally |
| Log | one JSON line per event on stdout; warnings and errors also stored in `ops_events` for 30 days | operator |
| Alerts | checked on every scheduler tick and deep check: tick late, error-rate jump, repeated provisioning failures, sign-in budget used up. An in-app notification to each operator, plus a POST to `OPS_ALERT_WEBHOOK_URL` (Slack-compatible `{"text": ...}`) when set. At most once per kind per hour. | operator |

Point an external uptime monitor at `/api/health/deep` every few minutes with the cron secret. It is the only thing
that notices a dead worker, because the tick cannot report its own absence.

A failing request returns `{ "error": "...", "requestId": "abc123def456" }` and an `x-request-id` header. Find the
details in your log by that id, or in SQL: `select * from ops_events where request_id = 'abc123def456';`

Operator access: with `INVITE_GATE=1`, the first account that signs in to the empty invite list becomes its owner and
sees `/app/admin`. Add more operators with `OPERATOR_USER_IDS=<orgo user id>,<id>` (they see emails masked). Everyone
else gets 404 for the page and its API.

## Before a deploy

1. `npm run typecheck` and `npx eslint src` are clean (CI runs these plus a production build).
2. The offline tests pass: `node scripts/safe-fetch-test.mjs`, `node src/lib/observability/redact.test.mjs`.
3. Against a development server and database: `node scripts/auth-hardening-test.mjs`, `node scripts/db-rls-check.mjs`,
   `node scripts/xss-test.mjs`, `node scripts/api-test.mjs --no-agent`.
4. New migrations are applied to the database before the code that needs them (they are additive; see below).

## Deploy and roll back

Keep each release in its own directory and switch a `current` link, so rolling back is switching the link back and
restarting the web process and the worker. [deploy.md](deploy.md) has a layout that works on any Node host.

A migration is not rolled back with the code. Migrations are additive; if a release depends on one, leave the
migration in place and roll back the code only.

### Apply a migration

1. Add a new file under `supabase/migrations/` (never edit an applied one).
2. Apply it with the Supabase CLI (`supabase db push`) or paste it into the SQL editor, staging first if you have one.
3. Run Supabase's security advisor for the project and `node scripts/db-rls-check.mjs` against a non-production
   database.

## Rotate a secret

Write a new random value (`openssl rand -hex 32`) into the server's environment file, then restart the web process and
the worker.

| Secret | Effect of rotating | Steps |
|---|---|---|
| `CRON_SECRET` | none for users | 1. new value 2. restart web and worker 3. update the uptime monitor's header |
| `SESSION_SECRET` | everyone is signed out | 1. new value 2. restart 3. tell users to sign in again |
| `APP_ENCRYPTION_KEY` | stored Orgo credentials and agent keys become unreadable: every user signs in again and their computer re-runs the agent API setup step | 1. new value 2. restart 3. in SQL: `update public.accounts set orgo_key_enc = null, hermes_key_enc = null, setup_steps = '{}'::jsonb;` 4. users sign in; setup re-runs on their next visit |
| `APP_DB_SECRET` | the app cannot reach the database until the new hash is stored | 1. new value 2. `node scripts/setup.mjs --env <your env file>` prints the SQL with the new hash 3. run it in the SQL editor 4. restart |
| Supabase publishable key | none if swapped in one go | rotate in the Supabase dashboard, update the env, rebuild (it is compiled into the build) and restart |
| Vendor keys (`AGENTMAIL_*`, `AGENTPHONE_*`, `ELEVENLABS_API_KEY`) | that feature pauses between steps | rotate at the vendor, update the env, restart; for webhook secrets update the vendor's webhook settings at the same time |
| One user's agent key | that user only | `update public.accounts set hermes_key_enc = null, setup_steps = setup_steps - 'hermes_api' where user_id = '<id>';` then their next visit re-keys it |

## Restore the database

There is no dump tooling in this repository; Supabase holds the backups.

1. Stop the worker and, if needed, the web process so nothing writes during the restore.
2. Supabase dashboard -> project -> Database -> Backups: restore a daily backup, or a point in time if your plan has
   it. This replaces the whole database.
3. If the backup predates the last `APP_DB_SECRET` rotation, store the current hash again (see "Rotate a secret").
4. Re-apply any migration newer than the backup.
5. Start the web process and the worker; `/api/health/deep` must return 200.

Task files cached under `OPENMAN_DATA_DIR` on the app server are not in the database backup. Files on users' computers
are covered by Orgo's own computer backups.

## Re-run provisioning after a setup change

1. In `src/lib/provision/index.ts`, bump the changed step in `SETUP_STEPS` and bump `SETUP_VERSION`.
2. Deploy.
3. Nothing else is needed: on each user's next visit `GET /api/me/provision` sees the computer is behind and runs only
   the changed steps quietly (at most one try per user per 10 minutes).
4. To force one user: `update public.accounts set setup_steps = setup_steps - '<step>' where user_id = '<id>';`
5. A user whose setup keeps failing: `update public.accounts set setup_steps = '{}'::jsonb, hermes_base_url = null where user_id = '<id>';`
   so the next attempt re-applies every step. `/app/admin` shows how many computers are behind or stuck.

## Drain a stuck queue

**Scheduler tick late** (alert, or "last tick" older than 3 minutes on `/app/admin`): check the worker's log and
restart it. One manual tick: `node scripts/worker.mjs --once` (reads `CRON_SECRET` and `APP_URL` from the environment
or `.env.local`).

**Outgoing webhook deliveries piling up**: each tick sends due deliveries, so restarting a stopped worker resumes
draining. To give up on deliveries to a dead endpoint:
`update public.webhook_deliveries set status = 'failed', last_error = 'drained by operator' where status = 'pending' and webhook_id = '<id>';`

**Automation runs stuck in `queued` or `running`**:

```sql
select id, automation_id, status, started_at from public.automation_runs where status in ('queued','running') order by started_at;
update public.automation_runs set status = 'failed', error = 'Stopped by operator', finished_at = now() where id = '<id>';
update public.automations set enabled = false, paused_reason = 'Paused by the operator.' where id = '<id>';
```

## Respond to a leaked credential

- **An OpenMan API key** (Settings -> Developers): the user deletes it there. Operator, if the user cannot:
  `delete from public.api_keys where id = '<id>';` (check `last_used_at` first).
- **A user's Orgo credential**: stored sealed; it leaks only if `APP_ENCRYPTION_KEY` leaks too. The user revokes it in
  their Orgo account settings. If `APP_ENCRYPTION_KEY` leaked, rotate it (above).
- **A session cookie or automations token**: the user clicks "Sign out everywhere", or the operator runs
  `insert into public.revocations (user_id, sessions_revoked_at, automations_not_before) values ('<id>', now(), now()) on conflict (user_id) do update set sessions_revoked_at = now(), automations_not_before = now(), updated_at = now();`
- **A user's agent key** (lets anyone run the agent on that user's computer through its public URL): rotate it as in
  the last row of the secrets table, then confirm the old key gets 401.

## Limit or pause the service

1. Stop background work: stop the worker (automations, webhooks, alerts and cost backfill stop).
2. Stop new people: run with `INVITE_GATE=1` and remove people from the invite list at `/app/admin` (they lose access
   within a minute). The owner keeps access.
3. Full stop: stop the web process.

## Settings this guide refers to

`CRON_SECRET` (deep check, tick), `OPS_ALERT_WEBHOOK_URL` (https only), `OPERATOR_USER_IDS`, `OPS_HASH_KEY` (key for
hashing user ids in logs; defaults to one derived from `SESSION_SECRET`), `LOG_LEVEL` (`debug|info|warn|error`,
default `info`), `INVITE_GATE`, `USAGE_LIMITS`. All are described in `.env.example`.
