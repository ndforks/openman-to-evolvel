# Security and data

What {{name}} keeps, where it keeps it, and how it is protected. For the formal statement, see the [privacy policy](/privacy).

## Where the work runs

- **Computers**: Orgo cloud computers in your own Orgo workspace. Files the agent makes stay on them.
- **Models**: the agent reaches Anthropic's Claude models through Orgo's model proxy, so prompts and responses travel through Orgo to Anthropic for processing.
- **App connections**: sign-ins to your apps are held by Composio for Orgo, not by {{name}}.

## What {{name}} keeps

{{name}} has its own database, hosted on Supabase, containing:

- your account (name, email, and references to your Orgo workspace and home computer);
- tasks with their steps, messages and attached files;
- projects and their files, knowledge entries, your profile and settings;
- skills you have built, custom connectors, automations and their run history;
- records of websites you build (the sites themselves stay on your computer);
- share links, notifications, API keys (stored as hashes) and webhook endpoints.

## Protections

- **Only the server touches the database.** Your browser never connects to it. Every request passes through {{name}}'s server, which verifies your session and reads or writes only your own rows.
- **Secrets are encrypted at rest** using AES-256-GCM: your Orgo key, the key for the agent on your computer, custom connector keys, webhook auth values and webhook signing secrets.
- **Sessions** are encrypted HttpOnly cookies valid for 30 days.
- **Live views** contain the computer's password, so the server hands them only to the computer's owner.
- **Shared tasks** mask text that looks like a password, key or token.

## What you control

- **Export**: get a zip of your tasks, steps, projects, knowledge and settings from **Settings → Data controls**.
- **Delete**: deleting your {{name}} data erases everything {{name}} holds, your stored Orgo key included. Your Orgo account, credits and computers are untouched; manage those on orgo.ai.
- **Sign out** closes the session in this browser.

## Found a vulnerability?

Send security reports to [privacy@orgo.ai](mailto:privacy@orgo.ai).
