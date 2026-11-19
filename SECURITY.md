# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue, discussion or pull request for them.

Use GitHub's private vulnerability reporting for this repository:
**[Report a vulnerability](https://github.com/OrgoAI/openman/security/advisories/new)** (Security tab, then
"Report a vulnerability").

Include what you can of:

- the affected component, route or file, and the version or commit;
- steps to reproduce, or a proof of concept;
- the impact you expect (for example data exposure across accounts, secret disclosure, remote code execution);
- whether you think it is being exploited.

We aim to acknowledge a report within 3 business days and to give a first assessment within 10 business days. We will
keep you informed, agree a disclosure date with you, and credit you in the advisory unless you prefer otherwise.
Please give us a reasonable time to release a fix before disclosing publicly, and do not access other people's data,
degrade a service or keep data beyond what is needed to show the problem.

A problem in Orgo's hosted service itself (orgo.ai, its API or its computers) rather than in this code should be
reported to Orgo through the contact listed at https://www.orgo.ai/.well-known/security.txt.

## Supported versions

OpenMan is early software and is released from the default branch. Security fixes go into the latest commit on
`main` and, once releases exist, the latest release. Older commits and releases are not patched; self-hosters should
update to the latest version.

| Version | Supported |
|---|---|
| `main` / latest release | Yes |
| Anything older | No |

## Scope

In scope: the code in this repository, including

- authentication, sessions and the sign-in flow;
- tenant isolation (one user reaching another user's tasks, files, computers, keys or data);
- the database access gate and row-level security in `supabase/migrations/`;
- secret handling (encryption at rest, secrets reaching browsers, logs or the agent's computer when they should not);
- server-side request forgery, injection, cross-site scripting and request forgery in the app and its public API;
- webhook signature checks and the scheduler endpoint;
- the setup scripts in `scripts/`.

Out of scope:

- What an agent does on its own user's computer with that user's permissions. The agent runs as an administrator on
  the user's own Orgo computer by design; prompt injection that stays within the same user's account is a known
  limitation, though reports that show a way to cross accounts or reach server secrets are in scope.
- Vulnerabilities in third-party services (Orgo, Supabase, model providers, AgentMail, AgentPhone, ElevenLabs,
  connectors) or in dependencies, unless OpenMan uses them in an unsafe way. Report those upstream.
- Misconfiguration of a self-hosted deployment (for example running with sign-in disabled on a public network, or
  committing secrets), and findings that need physical access or a compromised device.
- Missing best-practice headers or rate limits without a demonstrated impact, social engineering, and denial of
  service by volume.

See [docs/security-model.md](docs/security-model.md) for how the app is designed to protect data.
