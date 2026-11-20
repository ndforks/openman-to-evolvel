# CLAUDE.md

Read `AGENTS.md` first — it holds the project rules (what this repo is, the stack, module layout, testing
standards, guardrails) that apply to every agent. This file adds what is specific to Claude Code.

## Workflow (overrides the sibling-repo convention)

- **Commit and push directly to `main`, often.** This repository does not use feature branches, unlike every other
  project connected this session (`strtkit`, `trollbegone`, `gitman`, `exprmt`, old `evolvel`), which all develop on
  a named branch. Follow this repo's own rule here, not theirs.
- Never force-push.

## Skills

- Activate the matching skill before working in its area: `laravel-best-practices` for backend code, and the
  owner's skills from <https://github.com/nielsdrost7/skills> for tests and reviews.
- Writing or changing a test: `sturdy-phpunit-review` and `test-honesty`. A test is only done once you have broken
  the code and seen it fail.
- `mind-the-gap` whenever a form, a migration, or a service layer is involved — this project's `user_id` scoping
  rule (AGENTS.md) is exactly the kind of cross-cutting precondition that skill is built to audit.
- `release-resilience` before merging anything that adds a runtime path nobody watches (the automations scheduler
  tick, webhook delivery retries).

## Working here

- **Tests: PHPUnit, always.** Never write Pest.
- Modules are PascalCase: `Modules/Tasks`, namespace `Modules\Tasks\`. Only the Composer package name is lower case.
- **Database: MariaDB, always.** No SQLite, no PostgreSQL anywhere — tests, CI, local dev, docs, fallbacks.
- `legacy/openman-nextjs-*` is read-only reference material (the upstream OpenMan spec). Never edit it, never import
  from it, never run its `npm` scripts from this repo's tooling.
- Do not create documentation files beyond `AGENTS.md`/`CLAUDE.md` and this repo's roadmap table unless asked.
