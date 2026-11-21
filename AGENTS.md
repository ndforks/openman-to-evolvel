# AGENTS.md

This is the operating manual for every AI coding agent (Claude Code, Codex, Copilot, Cursor, JetBrains Junie, …) and
every human contributor working in this repository. It is the single source of truth for project standards.
`CLAUDE.md`, `.junie/guidelines.md`, and `.github/copilot-instructions.md` are short, tool-specific summaries that
point back here — if any of them ever disagrees with this file, this file wins.

## 1. What this repository is

**Evolvel** is a self-hosted, multi-agent software engineering and automation workspace, built in Laravel 13 /
PHP 8.3+ and organized into modules with `internachi/modular`.

It is a from-scratch Laravel rebuild of the product surface of **OpenMan** (`nickvasilescu/openman`, archived in
this repository under `legacy/openman-nextjs-*` for reference). Evolvel keeps OpenMan's product shape — tasks,
projects, automations, connectors, skills, websites, meetings, a public API — and replaces every component that
depended on a third-party SaaS (Orgo's cloud computers, Hermes Agent, Supabase) with a self-hosted equivalent,
built the way the owner's other Laravel/NativePHP projects are built (`strtkit`, `gitman`, `trollbegone`, `exprmt`,
and the previous `evolvel`).

**This file describes behaviour, not source.** OpenMan is licensed under its own terms (see
`legacy/openman-nextjs-LICENSE` and `legacy/openman-nextjs-THIRD_PARTY_NOTICES.md`); no upstream source text, file
structure, or copy is reused here. Only the concepts — what a task is, what an automation does, how sign-in works
— are rebuilt independently, in Laravel idiom, from scratch.

### 1.1 Why a second `evolvel`

The original `evolvel` repository rebuilt **OpenBot + OpenRouter** (persistent agents, a model gateway) as a
Laravel app running inside the owner's `ivpldock` Docker environment, controlled by an Android NativePHP app. That
project's `AGENTS.md`, `CLAUDE.md`, `handoff.md`, and `lessons_learned.md` are the best record available of what
breaks in a project like this one — module layout drift, loopback addresses baked into configuration, static
mutable registries, dishonest tests — and this repository inherits every guardrail that project established (see
§6, "Guardrails").

What changes here is the **product**. OpenMan's surface — tasks with a live event timeline, projects with files
and review proposals, scheduled automations, per-user connectors, skill builds, published websites, a versioned
public API with webhooks — is a richer, better-specified target than OpenBot's. This repository rebuilds that
surface, self-hosted, in its place.

### 1.2 Licensing and the legacy source tree

- `legacy/openman-nextjs-*` is the untouched upstream checkout (Next.js, TypeScript, Supabase). It exists **only**
  as a specification to read — the same role `ivpl-xprmt` plays for `exprmt`'s InvoicePlane v1 rebuild. It is
  never built, never run, and never imported from the Laravel application.
- Do not copy upstream file contents, comments, or prose into the Laravel app. Read `docs/ARCHITECTURE.md` and
  `docs/security-model.md` under `legacy/openman-nextjs-docs/` to understand the intended *behaviour*, then
  implement that behaviour independently.
- A parity ledger — on the pattern of `exprmt`'s `V1ParityLedgerTest` — is the intended way to track, over time,
  which OpenMan capability is ported, intentionally dropped as Orgo-specific, or still pending. It has not been
  built yet; see §8, "Roadmap."

## 2. What changes from OpenMan

OpenMan depends on Orgo (a paid cloud-computer provider) for compute, identity, and several integrations. Evolvel
replaces each of those dependencies with a self-hosted equivalent:

| OpenMan (Orgo-hosted) | Evolvel (self-hosted) |
| --- | --- |
| Sign in with Orgo (device approval or API key) | Laravel's own authentication (session-based for the web app, Sanctum tokens for the API); no third-party identity provider required |
| A user's own Orgo cloud computer, running Hermes Agent | `Modules/Agents`: a local execution engine behind a replaceable `AgentRuntime` contract, driving a sandboxed `git` worktree per run — generalized from the previous `evolvel`'s Coordinator/worktree design to fit OpenMan's richer task model |
| Claude accessed through Orgo's model proxy, billed to Orgo credits | `Modules/ModelGateway`: an OpenRouter-compatible gateway, carried over from the previous `evolvel`'s plan, with its own API keys and usage accounting |
| Supabase Postgres, gated by row-level security on a server secret header | MariaDB, gated by Laravel's own authorization (policies) and `user_id` query scoping — the application is the only client of its own database, so there is no separate row-level-security layer to reimplement |
| Orgo connectors, skills, schedules, app URLs, and file/terminal/metrics APIs | Built in-module: `Modules/Connectors` (per-user credentials and webhook definitions), `Modules/Skills` (a skill registry and build pipeline), `Modules/Automations` (cron-style and webhook triggers), `Modules/Websites` (static-site publishing from a task or project workspace) |
| A live desktop, streamed over noVNC | Out of scope for v1. There is no cloud VM to stream from; task progress is instead shown as the event/tool-call timeline OpenMan already records per task (`TaskEvent`) — the part of "live view" that transfers without a remote desktop |
| AgentMail, AgentPhone, ElevenLabs (agent email, phone, voice) | Documented as pending, optional integrations, under the same "offer only what works" rule OpenMan itself follows — not required for the core product, and not built in the first pass |

## 3. Stack

| Concern | Choice | Rationale |
| --- | --- | --- |
| Language / framework | PHP 8.3+, Laravel 13 | Matches every sibling project (`strtkit`, `gitman`, `trollbegone`, `exprmt`, the previous `evolvel`); PHP 8.3 is the floor so the app runs everywhere those do |
| Modularity | `internachi/modular` — `Modules/<PascalCase>`, namespace `Modules\<PascalCase>\` | Same package and layout as every sibling project |
| Database | **MariaDB only.** No SQLite, no PostgreSQL — in tests, CI, local development, documentation, or fallbacks | Standing owner rule (see `exprmt`'s `CLAUDE.md`); it also removes the need to reinvent Supabase's row-level security, since the application is the only database client, gated instead by policies and `user_id` scoping |
| Admin / internal UI | Filament 5, for operator screens (OpenMan's `/app/admin`) | Reuse an existing, maintained admin layer rather than build one |
| Primary UI | A Laravel (Blade/Livewire) web app over an authenticated `/api/v1`, mirroring OpenMan's "the UI talks to the backend through one client" rule | Keeps the API-first shape OpenMan already proved out, without committing to a SPA framework up front |
| Public API | Laravel Sanctum personal access tokens under `/api/v1`, following OpenMan's key design (`om_`-prefixed keys become `ev_`-prefixed ones, stored only as a SHA-256 hash, shown once) | A direct port of a documented, security-reviewed design |
| Agent execution | `Modules\Agents\Contracts\AgentRuntime`, behind a replaceable adapter; the first adapter targets OpenCode, run inside an isolated `git` worktree per task | The same execution-engine decision the previous `evolvel` made, now driving OpenMan's task/event model instead of OpenBot's |
| Model access | `Modules\ModelGateway`: an OpenRouter-compatible HTTP gateway, NVIDIA-first free models for builder agents | Carried over from the previous `evolvel`'s stack |
| Tests | **PHPUnit only**, until further notice | Every sibling project mandates this; Pest is not installed anywhere in this family of projects and must never be introduced |
| Mobile | NativePHP Mobile v4 + `nativephp/mobile-ui`, native EDGE screens, Android first — **not built in the first pass** | Matches `strtkit`'s starter shape; deferred so the domain model solidifies before a native shell is layered on top |
| Quality | Laravel Pint, PHPStan/Larastan, Rector | Same toolchain as every sibling project |

## 4. Architecture: `internachi/modular`

Everything domain-specific lives in a module under `Modules/<PascalCase>/`. `app/` holds only application wiring:
providers, `User`, and the thin web/API entry points that compose modules together.

Module directories are **PascalCase** (`Modules/Tasks`, never `Modules/tasks`); the Composer package name is the
only place a lower-case or kebab-case form is required (`modules/tasks`). Below `src/`, the directory a class
lives in must equal its namespace — a single mechanical rule that a `ModuleNamingTest`/`ArchitectureTest`-style
guard (see §6) checks automatically rather than by review.

```
Modules/<Name>/
├── composer.json          name: modules/<kebab-name>; PSR-4 for src/, tests/, database/factories|seeders
├── database/
│   ├── factories/         <Model>Factory (Modules\<Name>\Database\Factories)
│   ├── migrations/        auto-loaded
│   └── seeders/
├── resources/views/       namespaced view('<Name>::path') — PascalCase namespace, matching the directory
├── routes/                <name>-routes.php, auto-loaded; web routes wrapped in Route::middleware('web')
├── src/
│   ├── Contracts/         interfaces other modules depend on — never another module's model
│   ├── Data/              immutable DTOs and value objects
│   ├── Http/Controllers/  thin: validate, delegate to a service, return a response
│   ├── Models/            Eloquent models, always scoped to the owning user
│   ├── Providers/         <Name>ServiceProvider — contract bindings only
│   ├── Policies/          authorization — this project's replacement for OpenMan's Supabase row-level security
│   ├── Repositories/      implementations of Contracts
│   └── Services/          business logic and use-case classes — nothing else lives here
└── tests/
    ├── Unit/              no framework boot, no database
    ├── Feature/           HTTP, database, container
    └── Support/           test doubles and helpers (not discovered as tests)
```

### 4.1 Module status

| Module | Carries over from OpenMan | Status |
| --- | --- | --- |
| `Core` | Accounts, API keys (`ev_`-prefixed, SHA-256 stored), settings, notifications, webhooks and deliveries | **Built.** Models, migrations, `ApiKeyService`, `WebhookDispatcher`; tested |
| `Tasks` | `tasks`, `task_events` (a gap-free replay sequence), `task_files`, `task_members` | **Built.** Models, migrations, `TaskService` (status transitions, locked event sequencing); tested |
| `Projects` | `projects`, `project_files`, `project_members`, `project_proposals` | **Built.** Models, migrations, `ProposalReviewService` (approve/reject, one decision only); tested |
| `Agents` | The Hermes-Agent-on-a-computer concept | **Built.** `Sandbox` model and `GitWorktreeSandboxProvisioner` run real `git worktree add`/`remove` commands, tested against a throwaway repository rather than mocked. The `AgentRuntime` contract is bound to `OpenCodeAgentRuntime`, which drives the real `opencode` CLI (the `opencode-ai` package) as a background process per run and signals it to stop by PID; `NullAgentRuntime` remains available for deployments or tests with no `opencode` binary installed. Not yet wired: feeding a run's event stream into `Modules\Tasks`'s `TaskEvent` timeline |
| `Automations` | `automations`, `automation_runs`, the `scripts/worker.mjs` scheduler tick | **Built.** `AutomationScheduler` (a row-locked, concurrency-safe tick) and `php artisan automations:tick`, scheduled every minute in `routes/console.php`; tested |
| `ModelGateway` | Orgo's model proxy | Pending — port the previous `evolvel`'s OpenRouter-gateway plan |
| `Connectors` | `custom_connectors` | Pending |
| `Skills` | `skill_builds` | Pending |
| `Websites` | `websites`, `website_secrets` | Pending |
| `Knowledge` | `knowledge` | Pending |
| `Communications` | `mailboxes`/`mail_*`, `phone_numbers`/`phone_*` | Pending, optional — per OpenMan's "offer only what works" rule |
| `Meetings` | `meetings`, `recordings` | Pending, optional |

As of this writing, 111 PHPUnit tests pass against a real MariaDB instance, and `vendor/bin/pint --format agent`
is clean. Coverage spans every model relation, cast, unique constraint, enum classification, and service-layer
flow in the five built modules. Two real defects were found and fixed while writing that coverage, rather than
worked around: a `Process::path()` call to a non-existent directory threw before a sandbox could be marked
`failed`, leaving it stuck at `provisioning`; and Laravel's `expectsOutputToContain()` test helper ran a command's
database writes outside the enclosing test transaction, hiding a passing result behind a failing assertion.

**Deliberate deviations from the previous `evolvel`'s database conventions:** that project avoided `timestamps()`
and `json()` columns. This product's domain — task timelines, tool-call payloads, settings — genuinely needs both,
so they are allowed here. `bigIncrements()` primary keys and "never `enum()`" (prefer a validated string or a PHP
enum cast) are kept.

**One intentional exception to module isolation:** `App\Models\User` (not itself a module) has relations directly
into `Modules\Core`'s models, and uses Sanctum's `HasApiTokens` trait. This is the one place application code
reaches into a module's models directly, and it is expected: `app/` is allowed to know about every module; modules
are not allowed to know about each other's internals.

### 4.2 Module rules

- **`Services/` holds services only.** Never a controller, model, contract, or repository.
- Create modules and module classes with `php artisan make:module <Name>` and `make:* --module=<Name>`. Never
  hand-roll the skeleton.
- Modules talk to each other through public services, contracts, and DTOs — never through another module's
  models, tables, or internals. Declare the dependency in the module's `composer.json`.
- **Every table carries a `user_id` or `owner_id`, and every query is scoped by it.** This is this project's
  replacement for OpenMan's Supabase row-level-security gate. A guard test (on the pattern of the `mind-the-gap`
  skill) should fail the build if a new table with a person column has no corresponding policy.
- Bind contracts in the owning module's service provider — never in `App\Providers\AppServiceProvider`.
- Type everything: parameter types, return types, typed properties, array-shape PHPDoc. Curly braces on every
  control structure. Prefer a PHPDoc block over an inline comment.
- No static mutable registries. The previous `evolvel` flagged this pattern as "tolerated until replaced" — do
  not reintroduce it here.

## 5. Testing standards

These standards are shared, verbatim, with every sibling repository — consistency here matters more than anywhere
else, because the owner's review tooling assumes it.

1. **Naming.** Every test method is `public function it_<verb>_<outcome>(): void`, carries `#[Test]`, and reads as
   a sentence (`it_rejects_a_task_without_an_owner`). No `test_` prefix, no `given`/`then`.
2. **Arrange, Act, Assert.** Marked by comments, in that order, with exactly one Act per test.
3. **Honest assertions.** Never status-only, never `assertTrue(true)`, never "did not throw" as the sole check.
   Prove the outcome: a returned value, a persisted row (`assertDatabaseHas`/`assertDatabaseCount`), and — for a
   rejection — that nothing was written.
4. **Failure paths are tested**, one per validation rule or authorization check, each named for what it rejects.
5. **Isolation and determinism.** No test depends on another, on auto-incrementing IDs, or on wall-clock time;
   freeze time where it matters; use `RefreshDatabase` for database tests.
6. **Realism.** Feature tests exercise the real route and the real database (MariaDB, matching `phpunit.xml`),
   built with factories.
7. **Placement.** Module tests live in `Modules/<Name>/tests/{Unit,Feature}`, namespace `Modules\<Name>\Tests\…`.
   Application tests live in `tests/`.
8. **Every fixed regression ships with the test that reproduces it.**

Run the project's test-honesty analyzer before calling any test suite done.

## 6. Guardrails

| Guard | Catches |
| --- | --- |
| `tests/Unit/ProjectStandardsTest.php` | Non-`it_`/non-`#[Test]` methods, missing Arrange/Act/Assert markers, hollow assertions, namespace/directory mismatches, non-service classes inside `Services/` |
| `tests/Unit/DatabasePolicyTest.php` | `sqlite` or `pgsql` anywhere in configuration, tests, or documentation — MariaDB only |
| `tests/Unit/ModuleNamingTest.php` | Lower-case module directories, stale `composer.lock` path entries, mismatched view namespaces |
| `tests/Unit/NoLoopbackAddressTest.php` | `127.0.0.1`, `localhost`, or `::1` baked into configuration or code (CI workflows are exempt) |
| Pint, PHPStan — no blanket ignores | Style and type errors |
| The test-honesty analyzer | Hollow tests |

Never add `@phpstan-ignore`, a baseline entry, a skipped test, or loosened configuration to turn a check green. Fix
the underlying code instead.

> **Note on current state.** The guard tests above describe the rules this project enforces mechanically once
> they exist. As of this writing, none of them has been written yet — see §8, "Roadmap." Follow the rules in the
> meantime by review; do not claim a guard is active until its file exists and has been shown to fail on a
> deliberately bad example.

## 7. Commands

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan test                              # whole suite
php artisan test --testsuite=Modules          # module tests only
vendor/bin/pint --dirty --format agent        # format changed PHP before every commit
vendor/bin/phpstan analyse                    # static analysis
```

Database: MariaDB, always. Never write `127.0.0.1` or `localhost` into committed configuration or code — use a
container or service name once this project has its own verified `docker-compose.yml`. Unlike the previous
`evolvel`, this repository is not required to run inside the owner's `ivpldock` environment; it should ship a
working compose file so it can run standalone (see §8, "Roadmap").

## 8. Workflow

- **Commit and push directly to `main`, often.** This repository does not use feature branches — a deliberate
  exception to every sibling repository's "work on a named branch" rule, made explicitly by the owner for this
  project. Do not import the branch-based convention from those repositories here.
- Keep commits small and scoped to one change. Update this file, `CLAUDE.md`, `.junie/guidelines.md`, and
  `.github/copilot-instructions.md` whenever a convention changes.
- Do not open pull requests unless asked — there is no branch workflow to open one from, in any case.
- Never force-push `main`.
- Never pass `--no-verify`, and never weaken a security boundary to make a task or a test pass.

## 9. Roadmap

This is the honest, current state of the project. Treat anything not marked **built** in §4.1 as not started, even
if its directory already exists.

**Built this phase:** the Laravel application skeleton, `internachi/modular` wiring, and the `Core`, `Tasks`,
`Projects`, `Agents`, and `Automations` modules, each with real models, migrations, services, and tests.

**Not yet built, in priority order:**

1. `ModelGateway`, `Connectors`, `Skills`, `Websites`, `Knowledge` modules.
2. The authentication/sign-in flow and the `/app` web UI.
3. The public `/api/v1` HTTP surface over the Core/Tasks/Projects services that already exist.
4. Wiring an `OpenCodeAgentRuntime` run's JSON event stream into `Modules\Tasks`'s `TaskEvent` timeline — the
   adapter can start and stop a real `opencode` process, but nothing yet reads what it reports back.
5. A working, verified standalone `docker-compose.yml` — a draft exists at the repository root, but its `app`
   image has no PHP extensions installed yet, and MariaDB currently runs installed directly rather than
   containerized.
6. The guard tests listed in §6 — currently documented as rules only, not enforced in code.
7. The NativePHP mobile shell.
8. A parity ledger against `legacy/openman-nextjs-*`, on the pattern of `exprmt`'s `V1ParityLedgerTest`.
