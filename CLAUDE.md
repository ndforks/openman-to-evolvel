# CLAUDE.md

Read `AGENTS.md` first. It is the single source of truth for this project's standards — what the repository is,
the stack, module conventions, testing standards, and guardrails. This file adds only what is specific to
Claude Code.

## Workflow (an exception to the sibling-repo convention)

- **Commit and push directly to `main`, often.** This repository does not use feature branches, unlike every
  other project connected to this account (`strtkit`, `trollbegone`, `gitman`, `exprmt`, the previous `evolvel`),
  which all develop on a named branch. Follow this repository's own rule here, not theirs.
- Never force-push.

## Skills

- Activate the matching skill before working in its area: `laravel-best-practices` for backend code, and the
  owner's skills from <https://github.com/nielsdrost7/skills> for tests and reviews.
- Writing or changing a test: run `sturdy-phpunit-review` and `test-honesty`. A test is only done once you have
  broken the code it covers and watched it fail.
- Run `mind-the-gap` whenever a form, a migration, or a service layer is involved — this project's `user_id`
  scoping rule (`AGENTS.md` §4.2) is exactly the kind of cross-cutting precondition that skill audits.
- Run `release-resilience` before merging anything that adds a runtime path nobody watches, such as the
  automations scheduler tick or webhook delivery retries.

## Working here

- **Tests: PHPUnit, always.** Never write Pest.
- Modules are PascalCase: `Modules/Tasks`, namespace `Modules\Tasks\`. Only the Composer package name is
  lower case.
- **Database: MariaDB, always.** No SQLite and no PostgreSQL anywhere — tests, CI, local development,
  documentation, or fallbacks.
- `legacy/openman-nextjs-*` is read-only reference material: the upstream OpenMan specification. Never edit it,
  never import from it, and never run its `npm` scripts from this repository's tooling.
- Do not create documentation files beyond `AGENTS.md`, `CLAUDE.md`, `README.md`, and this repository's roadmap
  table, unless asked.
