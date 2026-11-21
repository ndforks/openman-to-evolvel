# Evolvel

Evolvel is a self-hosted workspace where you give an AI assistant a job — "draft this report," "fix this bug,"
"check this website every morning" — and it works on its own, inside a safe sandbox on your own computer, while you
watch its progress and approve anything risky before it happens.

It is a ground-up rebuild, in Laravel, of the ideas behind an open-source project called **OpenMan**, with every
part that depended on someone else's cloud service replaced by something that runs entirely on hardware you own.

## In plain English

Picture hiring a very capable personal assistant. They're fast, they never get tired, and they can use a computer
and the internet just like a person would. The catch with most AI assistants today is that they do their work on
*someone else's* computer, in *someone else's* building, and you have to trust that company with your files and
your business.

Evolvel is the same kind of assistant, except their desk is in *your* house. You give them a task. They go to a
private, locked room — a fresh, disposable workspace set aside just for that one job — read what you asked for,
and get to work. You can watch them the whole time, step by step, the way you'd watch someone work through a
to-do list. If they want to do something that changes something important, they show you first and wait for your
"yes." When the job is done, the room is cleared out, ready for the next task.

Nothing about this needs you to understand computers. It just means: **the helper, the workspace, and the record
of what it did all live on equipment you control** — not rented from a company you've never met.

## What it can do

- **Tasks** — hand it an instruction and a title ("draft the Q3 summary"); it works through the job and leaves a
  timeline of everything it did, so you can see exactly what happened and in what order.
- **Projects** — group related work together, with its own files and a review step: the assistant proposes a
  change, and a person approves or rejects it before anything is final.
- **Automations** — tell it to repeat a job on a schedule ("every morning at 9"), and it runs itself, reliably,
  without you lifting a finger.
- **A private sandbox for every job** — each task gets its own isolated, disposable copy of the project to work
  in (a real `git` working copy on its own branch), so one task can never step on another, or on the original
  files, while it's in progress.
- **Your own keys to the house** — accounts, API access tokens, and webhook notifications are all built in and
  owned by you; nothing phones home to a third party to work.

## What it is not (yet)

Evolvel is an early-stage rebuild, not a finished product. Today it has a solid, well-tested foundation — the
pieces above are real and working — but it does not yet have a sign-in screen, a visual dashboard, or the actual
"brain" that runs an AI model inside the sandbox. See [Project status](#project-status) below for the honest,
current picture, and `AGENTS.md` for the detailed roadmap.

## Why this exists

[OpenMan](https://github.com/nickvasilescu/openman) is an excellent open-source design for an AI agent workspace,
but it is built to run on a specific paid cloud provider (Orgo) with a specific hosted database (Supabase). Evolvel
keeps OpenMan's product ideas — tasks, projects, automations, a public API — and rebuilds them as an ordinary
Laravel application that you install and run yourself, on your own database, with no dependency on any one cloud
vendor. A full explanation of every substitution is in `AGENTS.md`.

The original OpenMan source is kept in this repository, untouched, under `legacy/openman-nextjs-*`, purely as
reference material for what to rebuild. It is never run and nothing in it is copied — only its documented
*behaviour* is reimplemented, in Laravel, from scratch.

## Project status

This is a from-scratch, in-progress rebuild. The table below is kept accurate on every change — if a module is not
marked **built**, treat it as not started yet, regardless of whether its folder exists.

| Area | Status |
| --- | --- |
| Accounts, API keys, settings, notifications, webhooks | **Built** and tested |
| Tasks and their step-by-step timeline | **Built** and tested |
| Projects, shared files, and the proposal-review workflow | **Built** and tested |
| Per-task sandboxes (isolated `git` worktrees) | **Built** and tested |
| Scheduled automations | **Built** and tested |
| The AI execution engine | **Built** — it can start and stop a real [OpenCode](https://github.com/sst/opencode) agent run in a sandbox, but nothing yet connects what that run reports back to a task's own timeline |
| Sign-in and the web dashboard | Not built |
| The public API surface | Not built |
| Model access, custom connectors, skills, published websites | Not built |
| Mobile app | Not built |

See `AGENTS.md` → "Roadmap" for the current, line-by-line state.

## Getting started (for developers)

Requirements: PHP 8.3+, Composer, and a MariaDB server (this project does not support SQLite or PostgreSQL — see
`AGENTS.md` for why).

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
```

Run the test suite:

```bash
php artisan test
```

A draft `docker-compose.yml` is included for a containerized MariaDB + app setup, but it has not yet been verified
end to end — see `AGENTS.md` for its current state.

## For contributors and AI coding agents

`AGENTS.md` is the single source of truth for how this project is built: its architecture, module conventions,
testing standards, and the automated guardrails that enforce them. `CLAUDE.md`, `.junie/guidelines.md`, and
`.github/copilot-instructions.md` are short, tool-specific pointers to the same rules — read `AGENTS.md` first.

## License

See `legacy/openman-nextjs-LICENSE` for the terms under which the original OpenMan project is kept as reference
material here. Evolvel's own code is original work, written independently from documented behaviour rather than
copied source.
