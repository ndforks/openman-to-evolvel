# BUILD_PLAN.md

The complete, line-item backlog for Evolvel: every piece of OpenMan's product surface that has not been rebuilt
yet, enumerated against OpenMan's actual database schema and documentation (`legacy/openman-nextjs-supabase/
migrations/20261120000000_baseline.sql`, `legacy/openman-nextjs-docs/ARCHITECTURE.md`, `legacy/openman-nextjs-docs/
security-model.md`, `legacy/openman-nextjs-README.md`). Nothing here is softened or summarized away — if OpenMan
has it, it is listed, even the parts that are low priority, optional, or that Evolvel may ultimately decide not to
build. Where a decision to drop something has already been made, it says so explicitly and why.

This file is the detail behind `AGENTS.md` §9's roadmap. `AGENTS.md` stays the short, current-state summary; this
file is the exhaustive one. Keep both in sync when work lands: check an item off here, update the one-line summary
there.

**How to read the checkboxes.** `[ ]` = not started. `[~]` = partially built (said exactly how). `[x]` = done and
tested. Never mark an item `[x]` because its migration or class exists — mark it done only once it does what this
document says it must do, and has the test coverage AGENTS.md §5 requires.

---

## 0. Already built (for orientation only — full detail in `AGENTS.md` §4.1)

`Core` (accounts, API keys, settings-by-key, notifications, webhooks+deliveries), `Tasks` (task + gap-free event
timeline + files + members, status transitions), `Projects` (project + files + members + a simple proposal
approve/reject flow), `Agents` (git-worktree sandboxes + the OpenCode `AgentRuntime` adapter: start/stop a real
process), `Automations` (a basic cron scheduler and tick command). 119 PHPUnit tests, all passing.

Every one of those, compared line-by-line against OpenMan below, turns out to be a **simplified first pass** — real
and tested, but missing fields and behavior OpenMan actually has. Those gaps are listed in their own sections below
(§1, §2, §4, §5) rather than hidden inside "done."

---

## 1. Core — gaps in what's already built, plus what's missing entirely

### 1.1 `Modules\Core\Models\Notification` — missing fields
OpenMan's `notifications` table (`kind`, `title`, `body`, `link`) is richer than ours (`type`, `data` JSON blob).
- [ ] Add `kind` (info/warning/error, or whatever the UI needs), `title`, `body`, `link` as real columns instead of
  burying them in `data`, so the UI can query and render without decoding JSON first.

### 1.2 `Modules\Core\Models\Setting` — architecture mismatch, needs a decision
We built one row per `(user_id, key)`. OpenMan stores one row per user with a single `data jsonb` blob
(`settings.user_id primary key, data jsonb`).
- [ ] **Decide and document**: keep the per-key design (more queryable, more rows) or switch to one JSON document
  per user (matches OpenMan exactly, simpler migrations when a new setting is added). Either is defensible; right
  now neither decision has been made on the record.

### 1.3 Sign-out-everywhere / session revocation — not started
OpenMan's `revocations` table (`user_id`, `sessions_revoked_at`, `automations_not_before`) backs "Sign out
everywhere" and account deletion, and survives account deletion itself.
- [ ] `Modules\Core\Models\Revocation` (or equivalent) + migration.
- [ ] A service that invalidates every session token issued before `sessions_revoked_at` — this has teeth only once
  real authentication (§9) exists.
- [ ] Automations started by a revoked-then-restored account must honor `automations_not_before` — do not let a
  queued automation run with a session that predates a revocation.

### 1.4 Usage caps for operator-paid vendors — not started
OpenMan's `usage_counters` table + `usage_consume()` SQL function atomically caps per-user daily/monthly spend on
vendors the *operator* pays for (phone numbers, SMS, agent inboxes, transcription, etc. — see §6, §7), checked
before every vendor call, never after.
- [ ] `Modules\Core\Models\UsageCounter` + migration (`user_id`, `metric`, `period` [day/month], `period_start`,
  `amount`).
- [ ] A `UsageLimiter` service with one atomic method (`consume(User $user, string $metric, int $amount, int
  $dayLimit, int $monthLimit): bool`) using a row lock, matching `usage_consume()`'s guarantee: it either records
  the usage and returns true, or changes nothing and returns false — never a partial charge.
- [ ] A config file (`config/usage-limits.php`, mirroring OpenMan's `src/config/usage-limits.ts`) with per-metric
  day/month caps, overridable by environment variable.
- [ ] This has no caller until Communications (§6) or another operator-paid integration exists — build it alongside
  the first thing that needs it, not speculatively.

### 1.5 Invite gate — not started
OpenMan's `invites` table + `invite_admit()` function: when `INVITE_GATE=1`, only people on the invite list sign
in; the first account to sign in to an empty list becomes its owner, atomically.
- [ ] `Modules\Core\Models\Invite` + migration (`orgo_user_id`-equivalent becomes just `user_id`/`email`, `role`
  owner/member, `added_by`).
- [ ] An `InviteGate` service with the same atomic "claim ownership of an empty list" guarantee as `invite_admit()`
  — a race between two brand-new signups must never produce two owners.
- [ ] Wire it into the sign-in flow once that exists (§9) behind a config flag (`INVITE_GATE`), off by default.

### 1.6 Operator observability (`ops_*` tables) — not started
OpenMan's `ops_events` (warnings/errors, redacted, 30-day retention), `ops_heartbeats` (last time each periodic job
ran), and `ops_alerts` (one alert per kind per cooldown window) back the operator page and the scheduler's health
checks.
- [ ] `Modules\Core\Models\OpsEvent`, `OpsHeartbeat`, `OpsAlert` + migrations.
- [ ] A `logEvent()`-equivalent helper (mirroring `src/lib/observability/log.ts`) that redacts secrets and hashes
  user ids (HMAC, never the raw id) before writing a row — this is a security control, not just logging hygiene;
  see §8.3.
- [ ] A scheduled job that deletes `ops_events` rows older than 30 days (OpenMan does this in its cron tick).
- [ ] The alert-sending logic itself depends on having something worth alerting on (failed automation runs,
  webhook delivery backlogs, missed heartbeats) — build the data model now, the actual alert rules once there is a
  second thing to alert about besides "the heartbeat didn't update."

---

## 2. Tasks — gaps in what's already built

Our `Task` model has `title`, `status`, `instructions`, `workspace_path`, `started_at`, `completed_at`. OpenMan's
`tasks` table has all of that plus a long list of fields with real product behavior behind them:

- [ ] **`mode`** (`standard`/`agent`/`chat`/`plan` in OpenMan's product — Evolvel's own mode set may differ, but
  *some* mode concept is needed) and **`effort`** (a reasoning-effort hint passed to the model).
- [ ] **`favorite`** and **`archived`** booleans, and **`pinned_at`** + **`unread`** for sidebar ordering/state —
  none of this exists on our model yet.
- [ ] **`target`** (jsonb) — what the task is pointed at (a URL, a file, a connector) when it isn't a bare
  instruction.
- [ ] **Parent/child tasks** — OpenMan finds child tasks (parallel side-tasks, "side chats", branches) through
  `meta->>'parentTaskId'`. Evolvel needs an explicit `parent_task_id` column (do not bury a foreign key inside a
  JSON blob the way OpenMan does — that was a pragmatic Postgres/Supabase choice, not one worth copying) plus the
  branching/side-chat UX concept itself, which does not exist in our model at all yet.
- [ ] **Run-state fields**: `computer_id`/`hermes_session_id` in OpenMan map to our `Sandbox` relationship, but we
  have no column on `Task` linking it to its `Sandbox`, and no equivalent of OpenMan's `meta` (queue position,
  which model actually ran after a fallback, the live run id) — some of this belongs on `Task`, some on `Sandbox`,
  and the split has not been decided.
- [ ] **Task sharing / collaboration** (`task_members`, `shares`): OpenMan lets an owner invite people by email as
  collaborators on one task (`task_members`, invited by email, filled in on first sign-in with that email) and
  create a public or private share link (`shares`: token, visibility). Our `TaskMember` only supports an already-
  existing `user_id` — there is no invite-by-email flow, and `shares`/public share pages do not exist at all.
- [ ] **Queueing**: OpenMan queues a task when a user already has too many running (bounded by their compute size);
  Evolvel has no concurrency limit or queue at all — any number of tasks can start sandboxes simultaneously today.
- [ ] **Follow-ups, approvals, and questions mid-task**: OpenMan's live task view lets a person send a follow-up
  message into a running task, answer an agent's question, or approve/deny a requested action, all mid-run. None
  of this exists yet — our `AgentRuntime` contract only has `start()`/`stop()`, nothing for "steer" or "respond."
  This is a contract change, not just a new service, and should be designed before building it, not bolted on.
- [ ] **The live event feed is not actually fed**: `GitWorktreeSandboxProvisioner` and `OpenCodeAgentRuntime` exist,
  but nothing parses an OpenCode run's `--format json` event stream into `TaskEvent` rows. This is the single
  highest-priority item in this entire document — everything else in Tasks assumes a task can actually produce a
  timeline, and today it cannot.

---

## 3. Projects — gaps in what's already built

Our `Project` has `name` and `instructions`. OpenMan's `projects` table adds:

- [ ] **`connectors text[]` and `skills text[]`** — which connectors/skills a project's tasks get by default
  (`project_connectors`, `project_skills` are a second, normalized home for the same idea in OpenMan — decide
  whether Evolvel wants both a project-level default list and a separate join table, or just one).
- [ ] **`pinned` and `sort_order`** — user-controlled ordering in a project list UI.
- [ ] **`folder`** (the working directory a project is rooted at) and **`computer`** (`local`/`cloud` — which
  execution target). Evolvel's `Sandbox`/`Agents` design already answers "where does this run," so this may map
  onto something that already exists rather than needing new columns — needs a decision, not just a port.
- [ ] **Richer project membership**: OpenMan's `project_members` has two roles (`editor`: can change instructions
  and files; `member`: starts tasks, sees only their own) and an invite-by-email flow (`email`, `member_id` filled
  on first sign-in, `invited_by`). Our `ProjectMember` has only a generic `role` string and requires an existing
  `user_id` — no invite flow, no editor/member distinction with actual enforced permissions.
- [ ] **Richer proposal lifecycle**: OpenMan's `project_proposals` status is `open`/`applied`/`dismissed`, with
  `proposed_by`, `decided_by`, `decided_at`, and a `changes jsonb` payload describing exactly what would change.
  Our `ProjectProposal` only has `pending`/`approved`/`rejected` and a plain `diff` text column — there is no
  record of *who* proposed or decided, and no structured `changes` payload an "apply" step could act on
  mechanically (today, "approved" doesn't actually change anything in the project; it is just a status flip).
- [ ] **Applying an approved proposal** — OpenMan's `applied` status implies the project's files/instructions
  actually got updated. Evolvel has no "apply" step at all: approving a proposal today does nothing but record the
  decision.

---

## 4. Agents — what's left after the OpenCode adapter

The adapter (`OpenCodeAgentRuntime`) can start and stop a real process. That is necessary, not sufficient:

- [ ] **Event stream ingestion** (restated from §2 because it is this module's job to produce the data Tasks
  consumes): read `opencode run --format json`'s stdout as it streams, decode each JSON event, and hand each one
  to `Modules\Tasks\Services\TaskService::recordEvent()` — through a contract, not a direct dependency on
  `Modules\Tasks`'s models (AGENTS.md §4.2: modules talk through contracts, never models).
- [ ] **Run completion detection** — something needs to notice when the OpenCode process exits (success, failure,
  or killed) and transition the `Task` out of `running`. Today nothing watches the process after `start()` returns.
- [ ] **Approvals and questions** — OpenCode's own permission system (the `--auto` flag we pass today
  auto-approves *everything*, which is explicitly called out as "dangerous!" in `opencode run --help`). A real
  product cannot ship with blanket auto-approval; it needs a way to pause on a risky action and wait for a human's
  yes/no, which means the `AgentRuntime` contract needs a `respond()`/approval method, and OpenCode needs to be run
  *without* `--auto` with those prompts routed somewhere a person can see and answer them.
- [ ] **Follow-up messages into a running session** — OpenCode supports `--continue`/`--session <id>` to resume a
  session; nothing in `OpenCodeAgentRuntime` uses this yet, so a running task cannot currently be steered.
- [ ] **Model/provider configuration** — `opencode run` accepts `--model provider/model` and needs the chosen
  provider authenticated (`opencode providers`/`opencode auth`) before it can do anything real. Nothing in Evolvel
  configures this yet; right now, a real run against a real deployment will fail for lack of credentials, and
  nothing surfaces that failure anywhere a user would see it.
- [ ] **Sandbox cleanup lifecycle** — `GitWorktreeSandboxProvisioner::destroy()` exists and is tested, but nothing
  calls it when a task finishes. Every completed task today leaves its worktree on disk forever. OpenMan's cron
  tick "sweeps idle task folders" — Evolvel has no equivalent sweep job.
- [ ] **Concurrency limits / queueing** (same gap as Tasks §2, listed here too because it is this module's
  resource to protect): nothing stops an unbounded number of sandboxes (and OpenCode processes) from being created
  at once.
- [ ] **The live desktop** — explicitly **out of scope**, already decided in `AGENTS.md` §2: there is no cloud VM
  to stream from a self-hosted sandbox, and the task-event timeline is the deliberate replacement. Listed here
  only so it is clear this was a decision, not an oversight.

---

## 5. Automations — what's left after the basic scheduler

Our `Automation`/`AutomationRun` model a plain cron schedule with a queued run. OpenMan's `automations` table is
considerably more capable:

- [ ] **Three kinds, not one**: `kind` is `schedule` (plain cron), `trigger` (event-driven — e.g. polling an RSS
  feed or inbox, tracked by `trigger_state jsonb` and polled via `poll_at`), or `advanced` (a custom repeat rule in
  `repeat jsonb`, with an optional `ends_at`). We have only built the plain-cron case.
- [ ] **`run_in`: `new` vs `same`** — whether each firing starts a brand-new task or continues the same one
  (`task_id` vs a fresh task each time). We always implicitly create something new; there is no "continue the same
  task" mode.
- [ ] **Retries with backoff**: OpenMan's `automation_runs` has `attempt`, `retry_at`, and a unique index
  (`automation_id, scheduled_for, attempt`) that guarantees two overlapping ticks can never double-fire the *same
  scheduled slot* even under retry. Our `AutomationScheduler` only guards against re-firing an automation whose
  `next_run_at` hasn't moved — there is no retry concept at all: a failed run today just sits there.
- [ ] **`failure_count` and `paused_reason`** — OpenMan auto-pauses an automation after repeated failures and
  records why. We have no failure tracking and no auto-pause.
- [ ] **Webhook-triggered automations** (`hook_token`) — an automation can be fired by an inbound webhook carrying
  its own unique token, not just by the clock. Not built at all.
- [ ] **`source_task_id`** — an automation created *from* a task ("turn this into a recurring job"). Not built.
- [ ] **Connecting automations to Projects** (`project_id`) and to connectors (`connectors text[]`) — an
  automation runs with a project's context and a specific set of connectors enabled. Not built; depends on §3 and
  §7 existing first.

---

## 6. ModelGateway — not started at all

Carried over from the previous `evolvel`'s plan (AGENTS.md §3): an OpenRouter-compatible HTTP gateway so Evolvel
has its own model access layer instead of depending on a per-user Orgo credit balance.

- [ ] The gateway service itself: accept OpenRouter-shaped chat-completion requests, forward to a configured
  upstream (NVIDIA-hosted free models first, per the previous `evolvel`'s stack choice), return an
  OpenRouter-shaped response.
- [ ] Per-deployment API key management for the gateway itself (who may call it) — separate from `Modules\Core`'s
  `ApiKeyService`, or deliberately reusing it; that choice has not been made.
- [ ] Usage accounting: OpenMan's `task_costs` table (`model`, `runs`, `input_tokens`, `output_tokens`, `cost_usd`,
  priced from the tokens reported on a `run.completed` event) is the direct model for this — Evolvel needs the same
  thing, scoped to whatever the gateway actually bills, once the event stream (§2, §4) exists to source it from.
- [ ] Wiring `OpenCodeAgentRuntime` to actually call through this gateway rather than whatever provider
  configuration `opencode` resolves on its own — today the adapter has no opinion on where the model comes from at
  all.
- [ ] Fallback behavior: OpenMan's task `meta` tracks "which model actually ran after a fallback" — if the primary
  model/provider is unavailable, something needs to fall back to a secondary one and record that it did.

---

## 7. Connectors — not started at all

OpenMan's `custom_connectors` (per-user MCP servers or custom APIs, `project_connectors` to scope them to a
project) is the model:

- [ ] `Modules\Connectors\Models\Connector` + migration: `kind` (`mcp`/`api`), for MCP a `transport`
  (`http`/`command`) with `url`/`command`/`args`, a sealed secret (headers or an API key), and for API connectors
  an `auth_header`. **The secret must be sealed at rest** (AES-256-GCM, matching OpenMan's `seal()`/`open()` — see
  §8.1) and never returned from any API response.
- [ ] A connector **status** lifecycle (`pending`/connected/failed with detail) — OpenMan tracks `status` +
  `status_detail` because registering an MCP server with the agent runtime can fail, and the user needs to see why.
- [ ] Wiring a connector's tools into whatever `AgentRuntime` actually passes to OpenCode (OpenCode has its own MCP
  server management — `opencode mcp` — so this is largely "translate our `Connector` rows into OpenCode's MCP
  config before a run starts," not a from-scratch MCP client).
- [ ] `project_connectors` equivalent: a per-project default connector list (see §3).
- [ ] **A real security review before this ships**: a `command`-transport MCP connector runs an arbitrary command
  on the machine running the sandbox. This is the single most dangerous surface in the entire product and needs
  its own threat-modeling pass, not just a CRUD implementation.

---

## 8. Skills — not started at all

OpenMan's `skill_builds` ("package a finished task as a reusable skill") and `project_skills` (per-project default
skill list) are the model. OpenMan itself also has a skill *library* to install from, which is Orgo/Hermes-hosted
and has no obvious Evolvel equivalent yet.

- [ ] `Modules\Skills\Models\SkillBuild` + migration: `task_id`, `skill_name`, `status`
  (`running`/`done`/`failed`), `detail`.
- [ ] A service that takes a finished `Task` and produces... something a future task can reuse. What "a skill"
  concretely *is* in a self-hosted, OpenCode-driven world (a saved prompt template? a checked-in script? an
  OpenCode "agent" config — `opencode agent`?) has not been decided. This needs a design decision before any code,
  not an implementation of OpenMan's exact shape, since OpenMan's skill library depends on Hermes infrastructure
  Evolvel does not have.
- [ ] `project_skills` equivalent: a per-project default skill list (see §3).
- [ ] **Recording a skill by demonstration** (OpenMan's screen-recording-to-skill feature, backed by `recordings`/
  `recording_parts`/`recording_images` — see §10) is listed by OpenMan itself as "not yet proven end to end" even
  upstream. Lowest priority in this entire document; it depends on a live desktop Evolvel has already decided not
  to build (§4).

---

## 9. Authentication, the web UI, and the public API — the three biggest holes

None of these exist in any form yet. Nothing in §1–§8 is reachable by an actual person until this section exists.

### 9.1 Authentication (replaces OpenMan's Orgo sign-in entirely — AGENTS.md §2)
- [ ] Laravel's own session-based login/registration for the `/app` web UI (email + password at minimum; OpenMan's
  "sign in with a third party" model does not apply — Evolvel has no third party to delegate to).
- [ ] Laravel Sanctum personal access tokens for the API (the `ApiKeyService` built in `Modules\Core` already does
  the OpenMan-style `ev_`-prefixed, SHA-256-hashed key design — it needs to be *wired into* an actual
  authentication guard, which it currently is not).
- [ ] Password reset flow.
- [ ] The invite gate (§1.5) and session revocation (§1.3), both unreachable until this exists.
- [ ] **Authorization policies**, one per module, replacing what OpenMan's Supabase row-level security did
  wholesale: `TaskPolicy`, `ProjectPolicy`, `ApiKeyPolicy`, etc. AGENTS.md §4.2 already states the rule ("every
  query scoped by `user_id`"); the actual `Policies/` classes enforcing it at the authorization layer, registered
  with Laravel's `Gate`, do not exist yet for any module.

### 9.2 The web UI (`/app` in OpenMan's terms)
- [ ] A dashboard: task list, project list, notifications.
- [ ] A task view: the instruction, the live event timeline (once §2/§4 feed it), a composer for follow-ups.
- [ ] A project view: instructions, files, the proposal review queue (approve/reject, from the Projects module
  that already exists).
- [ ] A settings screen (API keys, webhooks, notification preferences).
- [ ] An operator page (`/app/admin` in OpenMan) — account list, invite management, the `ops_*` data from §1.6.
- [ ] Public, logged-out share pages for a shared task (`shares.visibility = 'public'`) — once §2's task-sharing
  gap is closed. OpenMan redacts the owner's email/id and instructions on these; the same redaction rule applies
  here and has not been designed yet.
- [ ] A decision on the UI stack itself: AGENTS.md §3 says "Blade/Livewire," but no screen of any kind has been
  built, so that choice is still untested against a real screen.

### 9.3 The public API (`/api/v1`)
- [ ] Route definitions over the services that already exist in `Core`/`Tasks`/`Projects` — none exist yet; today
  those services are only reachable from PHP, not HTTP.
- [ ] **Rate limiting** per API key (OpenMan's `api_rate_limits`: an atomic fixed-window counter via
  `api_rate_hit()`). Needs a Laravel equivalent — likely the built-in rate limiter backed by the cache, with the
  same atomicity guarantee (increment-and-check in one step, never read-then-write).
- [ ] **Idempotency keys** (OpenMan's `api_idempotency`: a client-supplied key + a fingerprint of the request,
  replaying the stored response for a retried request with the same key). Not built.
- [ ] **Structured task output** (OpenMan's `api_tasks`: a caller can ask for a task's result shaped to a JSON
  schema; `structured_state` tracks none/pending/requested/done). Not built; depends on §2's event stream existing.
- [ ] **Outgoing webhook delivery with retry** — `Modules\Core\Services\WebhookDispatcher` only *queues* a
  `WebhookDelivery` row today. OpenMan's `webhook_deliveries` (`status`, `attempts`, `next_attempt_at`,
  `last_status`, `last_error`) implies an actual delivery worker that POSTs, records the response, and retries on
  failure with backoff — **this does not exist**. Today a queued delivery is permanently queued; nothing ever
  sends it.
- [ ] **An outbox scanner** (`api_outbox_state`: tracks how far a background scanner has gotten) if events need to
  be discovered rather than directly queued at the point they happen — may not be needed if Evolvel queues
  deliveries synchronously at the call site (as it does today); revisit once the delivery worker above is built.
- [ ] API documentation for whatever `/api/v1` actually exposes once it exists.

---

## 10. Communications (optional, explicitly lower priority — "offer only what works")

OpenMan's agent email (AgentMail) and agent phone (AgentPhone) integrations. Per AGENTS.md §2, these are documented
as pending and optional; they are listed here in full because the user asked for everything, not because they are
expected to ship before the items above.

### 10.1 Agent email
- [ ] `Modules\Communications\Models\Mailbox` (personal or workflow-address kind, `default_prompt` for workflow
  addresses), `MailSender` (an approved-sender allowlist, capped at 10 per user in OpenMan's code, not the schema —
  the cap must be enforced in a service, not assumed from the table), `MailMessage` (every inbound/outbound mail,
  including blocked mail kept for review), `MailThread` (one task per mail thread, CC'd people become task
  participants).
- [ ] An actual email-provider integration to receive and send mail — OpenMan uses AgentMail; Evolvel has made no
  decision on a self-hostable (or any) equivalent. This is a vendor-integration decision, not just a schema port.
- [ ] Inbound webhook verification (Svix-style signatures in OpenMan — see §12.1) before any inbound mail is
  trusted.
- [ ] Only mail from an approved sender may start a task (§1.4's usage caps apply to agent-inbox usage too).

### 10.2 Agent phone
- [ ] `Modules\Communications\Models\PhoneNumber` (one active number per user), `PhoneMessage` (SMS, with an
  `awaiting_approval`/`approved`/`denied` flow for anything that would start work), `PhoneCall` (a call **never**
  starts a task on its own — it waits for a `YES <confirm_code>` sent by SMS, a deliberate anti-spoofing control
  that must be preserved exactly, not simplified away).
- [ ] An actual SMS/voice provider integration — same "no decision made yet" status as email above.
- [ ] HMAC webhook verification, constant-time comparison, a time window, and de-duplication (§12.1) before any
  inbound call or text is trusted.

### 10.3 Chat channels (Slack, Telegram)
- [ ] `channel_links` equivalent — per-user link to a Slack or Telegram account/channel. OpenMan itself flags this
  as not yet proven end to end even upstream. Lowest priority of the three Communications sub-areas.

---

## 11. Websites — not started at all

OpenMan's `websites` + `website_secrets` tables: the agent can build, preview, and publish a static or full-stack
site from a task or project's working folder, hosted on the user's own machine.

- [ ] `Modules\Websites\Models\Website` + migration: `status` (`building`/`ready`/`draft`/`publishing`/
  `published`/`failed`/`unpublished`), `visibility` (`public`/`invite`/`private`), `template`, `dev_port`/
  `prod_port`, `preview_url`/`published_url`, `auto_publish`, `show_badge`.
- [ ] `Modules\Websites\Models\WebsiteSecret` — sealed (§8.1 crypto rules apply) named secrets written to the
  site's own `.env` at start time, never returned to a browser once set.
- [ ] A publishing mechanism. OpenMan uses Orgo "app URLs" on the user's cloud computer; Evolvel has no cloud
  computer to publish from, so this needs its own design — likely: serve a built site from the sandbox worktree
  through the main app (a reverse-proxy-style route), or hand it to a real static host. **Not decided yet.**
- [ ] The secrets database browser, scheduled jobs, analytics, and custom domains that OpenMan's own README lists
  as "not yet proven end to end" even upstream — lowest priority within this section.

---

## 12. Security controls that apply across everything above

AGENTS.md §4.2 states the headline rule (`user_id` scoping). OpenMan's security model has a longer list of specific,
load-bearing controls that Evolvel has not rebuilt yet, each of which is a precondition for shipping any of §6–§11
to a real, internet-reachable deployment:

### 12.1 Inbound webhook verification
- [ ] A generic "verify this inbound webhook" helper: HMAC or provider-specific signature check, constant-time
  comparison, a bounded time window (OpenMan uses 300 seconds), and event-id de-duplication (`webhook_receipts` in
  OpenMan). Needed by §10 before any vendor webhook can be trusted, and arguably by §9.3 for any inbound webhook at
  all.

### 12.2 SSRF-safe outbound fetching
- [ ] Any time Evolvel fetches a URL supplied by a user or produced by an agent (a custom connector's URL, an
  automation's RSS trigger, an outgoing webhook's target, a mail body's links), it must go through one shared,
  safe-fetch helper that: allows only `http(s)`, resolves the host and refuses private/loopback/link-local/
  metadata addresses, re-checks the address on every redirect (not just the first), and caps time and response
  size. **Nothing like this exists yet**, and §7 (connectors), §9.3 (outgoing webhooks), and §5 (RSS-style
  triggers) will all need it.

### 12.3 Secret sealing
- [ ] A `seal()`/`open()` pair (AES-256-GCM, a random 12-byte IV per value, an app-wide encryption key from config)
  — Laravel's own `encrypt()`/`decrypt()` helpers already do this and are already used ad hoc (e.g., the `Webhook`
  factory, the `Sandbox`... wait, `Account::sealed_credential`). **Formalize this as one named service or at least
  one documented convention** rather than calling `encrypt()` inline in different modules with no shared naming —
  right now there is no single place that says "this is how Evolvel seals a secret," just scattered call sites.

### 12.4 Redacted logging
- [ ] The `logEvent()`-equivalent from §1.6: hash user ids (HMAC, not the raw id), strip anything that looks like a
  secret, before anything is written to `ops_events` or any other log sink.

### 12.5 Rate limiting sign-in and other abuse-prone endpoints
- [ ] Sign-in attempts, API key resolution, and any public-facing form need throttling per client address (and
  globally), not just per authenticated user — `ApiKeyService::resolve()` today has no rate limit of any kind on
  repeated guesses against the hash.

### 12.6 CSRF and security headers
- [ ] Laravel's CSRF protection needs to be confirmed active and correctly scoped once the web UI (§9.2) exists.
- [ ] A Content-Security-Policy, `X-Frame-Options: DENY`, HSTS, `nosniff`, a strict referrer policy, and a
  permissions policy — OpenMan documents the exact set in `docs/security-model.md`; Evolvel has configured none of
  it yet because there is no web UI to protect.

### 12.7 Tenant isolation review
- [ ] Once Policies (§9.1) exist, a deliberate audit pass confirming every model that carries a `user_id` is
  actually unreachable cross-tenant through every route and every service method — not just assumed from the
  migration. This is exactly the kind of cross-cutting precondition the `mind-the-gap` skill (CLAUDE.md) exists to
  catch; run it once there is a web UI and API surface to audit.

---

## 13. Everything else already named in `AGENTS.md` §9 but not restated in full here

These are tracked in `AGENTS.md`'s short roadmap and are not re-detailed in this file to avoid drift between two
descriptions of the same thing — treat `AGENTS.md` §9, items 5–8, as part of this backlog too:

- [ ] A working, verified standalone `docker-compose.yml` (a draft exists; untested, missing PHP extensions in its
  `app` image).
- [ ] The guard tests described in `AGENTS.md` §6 (`ProjectStandardsTest`, `DatabasePolicyTest`, `ModuleNamingTest`,
  `NoLoopbackAddressTest`) — currently documented rules only, enforced by nothing.
- [ ] The NativePHP mobile shell.
- [ ] A parity ledger against `legacy/openman-nextjs-*`, on the pattern of `exprmt`'s `V1ParityLedgerTest` — the
  mechanical way to stop this very document from going stale, by making "is everything in OpenMan accounted for"
  a test instead of a document someone has to remember to re-read.

---

## Suggested build order

Not a commitment, a recommendation, because dependencies between these sections are real:

1. **Finish the Tasks/Agents loop** (§2's event-stream item, §4's completion detection and sandbox cleanup) — until
   a task can run end to end and leave a timeline, nothing downstream of it (sharing, the web UI, the public API)
   has anything real to show.
2. **Authentication** (§9.1) — nothing is reachable by a human without it.
3. **The minimal web UI** (§9.2's dashboard and task view only, not the admin page yet) — so #1 is actually
   observable by someone other than a test.
4. **The public API core** (§9.3's routes + rate limiting + idempotency, not structured output yet) — the
   productized way to reach #1 and #2 from outside.
5. Everything else, in whatever order real usage demands — Connectors and Websites are more load-bearing to a
   "software engineering workspace" pitch than Communications or Skills, but that is a product call, not an
   engineering one, and belongs to the owner, not this document.
