# Copilot instructions

`AGENTS.md` is the source of truth for every agent working in this repository. Read it first.

## What this repository is

**Evolvel** is a self-hosted, modular Laravel rebuild of the product surface of **OpenMan** (an open-source AI
agent workspace built on a paid cloud provider: Orgo for compute, Supabase for data). Evolvel keeps OpenMan's
product ideas — tasks with a live event timeline, projects with a proposal-review workflow, scheduled
automations, a public API — and replaces every component that depended on a third-party cloud service with a
self-hosted equivalent. The untouched OpenMan source lives under `legacy/openman-nextjs-*` purely as a
specification to read; it is never built, run, or copied from.

Stack: Laravel 13, PHP 8.3+, modularized with `internachi/modular`, MariaDB, PHPUnit.

## Module status

| Module | Status |
| --- | --- |
| `Core` — accounts, API keys, settings, notifications, webhooks | Built and tested |
| `Tasks` — task timeline with gap-free, replayable event sequencing | Built and tested |
| `Projects` — files, members, and a proposal approve/reject workflow | Built and tested |
| `Agents` — real `git`-worktree sandboxes; the AI execution engine itself is not built yet | Partially built |
| `Automations` — a concurrency-safe cron scheduler | Built and tested |
| `ModelGateway`, `Connectors`, `Skills`, `Websites`, `Knowledge`, auth/UI, the public API, mobile | Not started |

Treat anything not marked built above as not started, regardless of whether its directory exists.

## Rules

- Commit and push directly to `main`, often. This repository has no feature-branch workflow. Never force-push.
- Modules live in `Modules/<PascalCase>` (`Modules/Tasks`, namespace `Modules\Tasks\`); only the Composer package
  name is lower case (`modules/tasks`). Create modules and classes with `php artisan make:module` and
  `make:* --module=<Name>` — never hand-roll the skeleton.
- `Services/` holds business logic only — never a controller, model, contract, or repository.
- Every table carries a `user_id` or `owner_id`, and every query is scoped by it — this project's replacement for
  the row-level security OpenMan relies on at the database layer.
- **Tests are PHPUnit only — never Pest.** Name tests `it_<verb phrase>`, mark them `#[Test]`, and structure them
  as `/* Arrange */ /* Act */ /* Assert */` with one Act per test; prefer data providers over loops. A test is
  only finished once you have broken the behavior it covers and watched it fail. A status-only assertion or
  `assertTrue(true)` is not acceptable coverage.
- **Database: MariaDB, always.** No SQLite and no PostgreSQL — in tests, CI, local development, documentation, or
  fallbacks.
- `legacy/openman-nextjs-*` is read-only reference material. Never edit it, import from it, or run its `npm`
  scripts from this repository's tooling.
- PHP 8.3 is the minimum supported version. Run `vendor/bin/pint --dirty --format agent` and the affected tests
  before every push.
- Update `AGENTS.md`, `CLAUDE.md`, `.junie/guidelines.md`, and this file together whenever a convention changes.
