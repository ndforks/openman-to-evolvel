# Junie guidelines

Read `AGENTS.md` first — it is the source of truth. This file is the short form for JetBrains Junie.

## What this repository is

**Evolvel** is a self-hosted, modular Laravel rebuild of the product surface of **OpenMan** (an open-source AI
agent workspace built on a paid cloud provider). Evolvel keeps OpenMan's product ideas — tasks, projects,
automations, a public API — and replaces every piece that depended on a third-party cloud service with a
self-hosted equivalent. The untouched OpenMan source is kept under `legacy/openman-nextjs-*` as reference
material only; it is never built, run, or copied from.

Stack: Laravel 13, PHP 8.3+, `internachi/modular` for module organization, MariaDB, PHPUnit.

## Module status

| Module | Status |
| --- | --- |
| `Core` (accounts, API keys, settings, notifications, webhooks) | Built and tested |
| `Tasks` (task timeline with gap-free event sequencing) | Built and tested |
| `Projects` (files, members, proposal review) | Built and tested |
| `Agents` (git-worktree sandboxes; the execution engine itself is not built) | Partially built |
| `Automations` (cron-style scheduler) | Built and tested |
| `ModelGateway`, `Connectors`, `Skills`, `Websites`, `Knowledge`, auth/UI, public API, mobile | Not started |

## Rules

- Commit and push directly to `main`, often. This repository has no feature-branch workflow. Never force-push.
- Modules live in `Modules/<PascalCase>` (`Modules/Tasks`, namespace `Modules\Tasks\`). Only the Composer package
  name is lower case (`modules/tasks`). Create modules and module classes with `php artisan make:module` /
  `make:* --module=<Name>`; never hand-roll the skeleton.
- `Services/` holds services only — never a controller, model, contract, or repository.
- Every table carries a `user_id` or `owner_id`, and every query is scoped by it — this project's replacement for
  OpenMan's row-level security.
- **PHPUnit only, never Pest.** Tests are `it_<verb phrase>` methods, `#[Test]`, `/* Arrange */ /* Act */
  /* Assert */`, data providers instead of loops. A test is only done after you have broken the code it covers
  and watched it fail. Never write a status-only or `assertTrue(true)` assertion.
- **Database: MariaDB, always.** No SQLite, no PostgreSQL — in tests, CI, local development, or fallbacks.
- `legacy/openman-nextjs-*` is read-only reference material. Never edit it or import from it.
- PHP 8.3 is the minimum supported version. Run `vendor/bin/pint --dirty --format agent` and the affected tests
  before every push.
- Update `AGENTS.md`, `CLAUDE.md`, this file, and `.github/copilot-instructions.md` whenever a convention changes.
