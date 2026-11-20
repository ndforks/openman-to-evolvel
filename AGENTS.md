# AGENTS.md

Operating manual for every AI coding agent (Claude Code, Codex, Copilot, Cursor, …) and every human contributor
working in this repository. Single source of truth for project standards; `CLAUDE.md` imports it.

## What this repository is

**Evolvel** is a self-hosted, multi-agent software engineering and automation workspace, written in Laravel 13 /
PHP 8.3+, modularised with `internachi/modular`. It is a from-scratch Laravel rebuild of the product surface of
**OpenMan** (`nickvasilescu/openman`, archived in this repo under `legacy/openman-nextjs-*` for reference), carrying
over its product shape — tasks, projects, automations, connectors, skills, websites, meetings, a public API — while
replacing every piece that depended on a third-party SaaS (Orgo's cloud computers, Hermes Agent, Supabase) with a
self-hosted equivalent built the way the owner's other Laravel/NativePHP projects are built: `strtkit` (module
skeleton, NativePHP mobile shell), `gitman`, `trollbegone`, `exprmt`, and the **previous** `evolvel` (OpenBot/OpenRouter
rebuild, superseded by this one — see "Why a second `evolvel`" below).

This file is **behaviour-only**: OpenMan is AGPL/custom-licensed upstream — read `legacy/openman-nextjs-LICENSE` and
`legacy/openman-nextjs-THIRD_PARTY_NOTICES.md` before copying anything beyond documented behaviour. No upstream source
text, file structure, or copy is reused; only the concepts (what a task is, what an automation does, how sign-in
works) are rebuilt independently in Laravel.

## Why a second `evolvel`

The original `evolvel` repository rebuilt **OpenBot + OpenRouter** (persistent agents, a model gateway) as a Laravel
app running inside the owner's `ivpldock` Docker environment, controlled by an Android NativePHP app. That project's
`AGENTS.md`/`CLAUDE.md`/`handoff.md`/`lessons_learned.md` are the best record of what breaks in a project like this
— module layout drift, loopback addresses baked into config, static mutable registries, test dishonesty — and this
repository inherits every one of those guardrails (see "Guardrails" below). What changes here is the **product**:
OpenMan's surface (tasks with live events, projects with files and proposals, automations with scheduled triggers,
per-user connectors, skill builds, published websites, meetings, a versioned public API with webhooks) is a richer,
better-specified target than OpenBot's. This repo rebuilds *that* surface, self-hosted, instead.

## Licensing and legacy source

- `legacy/openman-nextjs-*` is the untouched upstream checkout (Next.js/TypeScript/Supabase), kept **only** as a
  specification to read, the same way `exprmt` reads `ivpl-xprmt` for InvoicePlane v1 parity. It is never built,
  never run, and never imported from the Laravel app.
- Do not copy upstream file contents, comments, or prose into the Laravel app. Read `docs/ARCHITECTURE.md` and
  `docs/security-model.md` under `legacy/openman-nextjs-docs/` for behaviour, then implement that behaviour in Laravel
  idiom from scratch.
- A parity ledger (see `exprmt`'s `V1ParityLedgerTest` for the pattern) is the eventual way to track "every OpenMan
  capability is ported, intentionally dropped (Orgo-specific), or pending" — not yet built; see "Roadmap" below.

## What changes from OpenMan (the Orgo-shaped pieces)

| OpenMan (Orgo-hosted) | Evolvel (self-hosted) |
| --- | --- |
| Sign in with Orgo (device approval or API key) | Laravel's own auth (Breeze-style session + Sanctum tokens for the API); no third-party identity provider required |
| User's own Orgo cloud computer, Hermes Agent | `Modules/Agents`: a local execution engine behind a replaceable `AgentRuntime` contract, driving a sandboxed git worktree per run — the same shape as the previous `evolvel`'s Coordinator/worktree design, generalised to OpenMan's richer task model |
| Claude via Orgo's model proxy, billed to Orgo credits | `Modules/ModelGateway`: an OpenRouter-compatible gateway module (ported concept from the previous `evolvel`), own API keys, own usage accounting |
| Supabase Postgres, row-level security via a server secret header | MariaDB, Laravel's own authorization (policies) and query scoping by `user_id`; no RLS layer to reimplement, the application is the only client of its own database |
| Orgo connectors, skills, schedules, app URLs, file/terminal/metrics APIs | Built in-module: `Modules/Connectors` (per-user credential + webhook definitions), `Modules/Skills` (skill registry + build pipeline), `Modules/Automations` (cron-style + webhook triggers), `Modules/Websites` (static site publishing from a task/project workspace) |
| Live desktop over noVNC | Out of scope for v1 — there is no cloud VM to stream; task progress is shown as the event/tool-call timeline OpenMan already keeps per task (`TaskEvent`), which is the part of "live view" that transfers without a remote desktop |
| AgentMail / AgentPhone / ElevenLabs (agent email, phone, voice) | Documented as pending, optional integrations behind the same "offer only what works" rule OpenMan itself uses (`docs/ARCHITECTURE.md`'s "Optional integrations" table) — not required for the core product and not built in the first pass |

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Language / framework | PHP 8.3+, Laravel 13 | Matches every sibling project (`strtkit`, `gitman`, `trollbegone`, `exprmt`, `evolvel`); PHP 8.3 is the floor so the app runs everywhere those do |
| Modularity | `internachi/modular` (`Modules/<PascalCase>`, namespace `Modules\<PascalCase>\`) | Same package and layout as `strtkit`/`gitman`/`exprmt`/old `evolvel` |
| Database | **MariaDB only.** No SQLite, no PostgreSQL — in tests, CI, local dev, docs, or fallbacks | Standing owner rule (`exprmt`'s `CLAUDE.md`), and it also removes the need to reinvent Supabase's row-level security: the Laravel app is the only database client, same as OpenMan's Supabase gate, enforced instead by policies + `user_id` scoping |
| Admin / internal UI | Filament 5 (as in `strtkit`) for operator screens (the `admin` surface OpenMan calls `/app/admin`) | Reuse, don't rebuild, an admin CRUD layer |
| Primary UI | Laravel (Blade/Livewire) web app over an authenticated `/api/v1`, mirroring OpenMan's own "UI talks to the backend through one client library" rule | Keeps the API-first shape OpenMan already proved out, without committing to a SPA framework up front |
| Public API | Laravel Sanctum personal access tokens, versioned under `/api/v1`, OpenMan-style (`om_`-prefixed key convention becomes an `ev_`-prefixed one, SHA-256 stored, shown once) | Direct port of a documented, security-reviewed design |
| Agent execution | `Modules\Agents\Contracts\AgentRuntime` behind an adapter; first adapter targets OpenCode, run in an isolated git worktree per task/run | Same execution-engine decision the previous `evolvel` made (`OpenCode behind a replaceable adapter`), now driving OpenMan's task/event model instead of OpenBot's |
| Model access | `Modules\ModelGateway`: an OpenRouter-compatible HTTP gateway, NVIDIA-first free models for builder agents | Carried over from the previous `evolvel`'s stack table |
| Tests | **PHPUnit only**, until further notice | Every sibling repo mandates this; Pest is not installed anywhere in this family of projects and must never be introduced |
| Mobile | NativePHP Mobile v4 + `nativephp/mobile-ui`, native EDGE screens, Android first — **not built in the first pass**, scaffolded once the web API is stable | Matches `strtkit`'s starter shape and the previous `evolvel`'s "Android app, controlled from anywhere" goal, deferred so the domain model solidifies first |
| Quality | Laravel Pint, PHPStan/Larastan, Rector | Same toolchain as every sibling |

## Architecture: internachi/modular

Everything domain-specific lives in a module under `Modules/<PascalCase>/`. `app/` only holds application wiring
(providers, `User`, the thin web/API entry points that compose modules). Module directories are **PascalCase**
(`Modules/Tasks`, not `Modules/tasks`); the Composer package name is the only lower-case/kebab form it needs
(`modules/tasks`). Below `src/`, the directory a class lives in must equal its namespace — this single rule is what
`ModuleNamingTest`/`ArchitectureTest`-style guards (ported from `strtkit`/`gitman`) check mechanically, not by review.

```
Modules/<Name>/
├── composer.json          name: modules/<kebab-name>, PSR-4 for src/, tests/, database/factories|seeders
├── database/
│   ├── factories/         <Model>Factory (Modules\<Name>\Database\Factories)
│   ├── migrations/        auto-loaded
│   └── seeders/
├── resources/views/       namespaced view('<Name>::path')  — PascalCase namespace, same as the directory
├── routes/                 <name>-routes.php, auto-loaded, web routes wrapped in Route::middleware('web')
├── src/
│   ├── Contracts/          interfaces other modules depend on (never another module's model)
│   ├── Data/                immutable DTOs / value objects
│   ├── Http/Controllers/    thin: validate, delegate to a service, return a response
│   ├── Models/               Eloquent models, always scoped to the owning user
│   ├── Providers/            <Name>ServiceProvider — contract bindings only
│   ├── Policies/              authorization, replacing what OpenMan's Supabase RLS did at the database layer
│   ├── Repositories/          implementations of Contracts
│   └── Services/              business logic and use-case classes — nothing else lives here
└── tests/
    ├── Unit/                no framework boot, no database
    ├── Feature/              HTTP, database, container
    └── Support/               test doubles and helpers (not discovered as tests)
```

### Planned modules (first pass)

| Module | Carries over from OpenMan | Status |
| --- | --- | --- |
| `Core` | Accounts, settings, notifications, API keys, webhooks, usage counters, invites, ops events | scaffolded this session |
| `Tasks` | `tasks`, `task_events`, `task_files`, `task_members` — an agent run and its timeline | scaffolded this session |
| `Projects` | `projects`, `project_files`, `project_members`, `project_proposals` | scaffolded this session |
| `Agents` | The Hermes-Agent-on-a-computer concept, replaced by `AgentRuntime` + git-worktree sandboxes | contract + stub adapter scaffolded this session |
| `Automations` | `automations`, `automation_runs`, the `scripts/worker.mjs` scheduler tick | scaffolded this session |
| `ModelGateway` | Orgo's model proxy | pending — port the previous `evolvel`'s OpenRouter-gateway plan |
| `Connectors` | `custom_connectors` | pending |
| `Skills` | `skill_builds` | pending |
| `Websites` | `websites`, `website_secrets` | pending |
| `Knowledge` | `knowledge` | pending |
| `Communications` | `mailboxes`/`mail_*`, `phone_numbers`/`phone_*` | pending, optional per the OpenMan "offer only what works" rule |
| `Meetings` | `meetings`, `recordings` | pending, optional |

Rules:

- **`Services/` is for services only.** Never a controller, model, contract or repository.
- Create modules and module classes with `php artisan make:module <Name>` / `make:* --module=<Name>`; never hand-roll
  the skeleton.
- Modules talk to each other through public services, contracts and DTOs, never through another module's models,
  tables or internals. Declare the dependency in the module `composer.json`.
- **Every table carries a `user_id`/`owner_id` and every query is scoped by it** — this is this project's replacement
  for OpenMan's Supabase row-level-security gate. A guard test (ported from the `mind-the-gap` skill's pattern) should
  fail the build if a new table with a person column has no corresponding policy.
- Bind contracts in the owning module's service provider, never in `App\Providers\AppServiceProvider`.
- Type everything: parameter types, return types, typed properties, array-shape PHPDoc. Curly braces on every control
  structure. Prefer PHPDoc over inline comments.
- No static mutable registries — the pattern the old `evolvel` flagged as "tolerated until replaced"; do not
  reintroduce it here.

## Testing standards

Ported verbatim from the sibling projects' `AGENTS.md` files — this is the one area where consistency across all six
repositories matters most, since the owner's review skills assume it.

1. **Naming.** Every test method is `public function it_<verb>_<outcome>(): void`, `#[Test]`, reads as a sentence
   (`it_rejects_a_task_without_an_owner`). No `test_` prefix, no `given`/`then`.
2. **Arrange, Act, Assert.** Marked by comments, in that order, one Act per test.
3. **Honest assertions.** Never status-only, never `assertTrue(true)`, never "did not throw" as the only check. Prove
   the outcome: a returned value, a persisted row (`assertDatabaseHas`/`assertDatabaseCount`), and for rejections,
   that nothing was written.
4. **Failure paths tested**, one per validation rule / authorization check, named for what is rejected.
5. **Isolation and determinism.** No cross-test dependency, no reliance on auto-increment ids, frozen time where time
   matters, `RefreshDatabase` for database tests.
6. **Realism.** Feature tests hit the real route and the real database (MariaDB, matching `phpunit.xml`), built with
   factories.
7. **Placement.** `Modules/<Name>/tests/{Unit,Feature}` in `Modules\<Name>\Tests\…`. Application tests in `tests/`.
8. **Regressions ship with the reproducing test.**

Run the honesty analyzer (same script family as `exprmt`/`gitman`) before calling tests done.

## Guardrails

| Guard | Catches |
| --- | --- |
| `tests/Unit/ProjectStandardsTest.php` | non-`it_`/non-`#[Test]` methods, missing Arrange/Act/Assert, hollow assertions, namespace/directory mismatches, non-service classes in `Services/` |
| `tests/Unit/DatabasePolicyTest.php` | `sqlite`, `pgsql` anywhere in config/tests/docs — MariaDB only |
| `tests/Unit/ModuleNamingTest.php` | lower-case module directories, stale `composer.lock` path entries, mismatched view namespaces |
| `tests/Unit/NoLoopbackAddressTest.php` | `127.0.0.1`/`localhost`/`::1` baked into config or code (CI workflows exempt) |
| Pint, PHPStan (no blanket ignores) | style, type errors |
| `test-honesty` analyzer | hollow tests |

Never add `@phpstan-ignore`, baseline entries, skipped tests, or loosened config to get green. Fix the code.

## Commands

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

Database: MariaDB, always. No `127.0.0.1`/`localhost` in configuration — use container/service names once this
project gets its own `docker-compose.yml` (unlike the old `evolvel`, this repo is not required to live inside
`ivpldock`; it should ship its own compose file so it is runnable standalone — see Roadmap).

## Workflow

- **Commit and push directly to `main`, often.** No feature branches for this repository, per the owner's explicit
  instruction for this project — this differs from every sibling repo's "work on a named branch" rule; do not import
  that convention here.
- Keep commits small and scoped. Update this file and `CLAUDE.md` whenever a convention changes.
- Do not open pull requests unless asked (there is no branch workflow to open one from, in any case).
- Never force-push `main`.
- Never use `--no-verify`. Never weaken a security boundary to make a task or test pass.

## Roadmap (honest state, kept current)

This session scaffolded the Laravel application, `internachi/modular` wiring, and the `Core`, `Tasks`, `Projects`,
`Agents`, and `Automations` modules with real models, migrations, services and a first set of honest PHPUnit tests.
Not yet built, in priority order: `ModelGateway`, `Connectors`, `Skills`, `Websites`, `Knowledge`, auth/sign-in flow,
the public `/api/v1` surface with webhooks, the scheduler tick command, a standalone `docker-compose.yml`, NativePHP
mobile shell, and the parity ledger against `legacy/openman-nextjs-*`. Treat anything not in the table above as not
started — do not report a module done because its directory exists.
