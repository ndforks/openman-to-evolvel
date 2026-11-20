# Security model

How OpenMan protects users and their data, and the limits of that protection. To report a vulnerability, see
[SECURITY.md](../SECURITY.md).

## Trust boundaries

- **The browser** is untrusted. It never talks to the database, never receives a stored secret, and gets the live
  desktop URL only from the server, for its owner, with `Cache-Control: no-store`.
- **The app server** holds the deployment's secrets and every user's sealed Orgo credential. It is the only database
  client.
- **Each user's Orgo computer** runs the agent as an administrator. It is the user's own machine: the agent can do
  anything the user's computer and connected accounts allow. The design goal is that nothing on that computer can reach
  another user's data or the server's secrets.
- **Third-party services** (Orgo, Supabase, AgentMail, AgentPhone, ElevenLabs, connected apps) are reached over HTTPS
  with credentials that never leave the server, except where a user puts their own keys on their own computer.

## Database gate

- Every table has row-level security with a single policy that admits the `anon` role only when `private.is_server()`
  is true: the SHA-256 of the `x-om-secret` request header equals the one row in `private.server_secret`.
- The hash is stored per environment outside the migrations; the migrations contain no secret or hash.
- `authenticated` has no grants or policies. Requests with the publishable key and no header see no rows and cannot
  write. RPC functions (`api_rate_hit`, `usage_consume`, `invite_admit`) run as security invoker, so the same gate
  applies.
- `db()` refuses to run in a browser, and every repository query is scoped by the signed-in user's id.

## Sessions and secrets

- Secrets stored for a user (Orgo credential, agent API key, connector and website secrets, webhook signing secrets)
  are sealed with AES-256-GCM (`APP_ENCRYPTION_KEY`), a random 12-byte IV per value and an authentication tag.
- The session cookie is sealed with its own key (`SESSION_SECRET`) and additional authenticated data, is HttpOnly,
  SameSite=Lax, Secure in production, lasts 30 days, and is checked against the `revocations` table. It never carries
  the Orgo credential.
- "Sign out everywhere" and account deletion write to `revocations`, which settings requests cannot change and which
  survives account deletion.
- Public API keys are `om_` plus 24 random bytes, stored only as SHA-256 and shown once; requests are rate limited per
  key and idempotency keys are scoped per user.
- Secrets sent to a user's computer (agent key, connector headers, automations token) travel as a staged file through
  Orgo's file transfer, read and deleted by the setup script, never in a command line.
- Logs pass through a redaction step and store a keyed hash of user ids, not the ids.

## Sign-in

- The device or authorization flow can only be completed in the browser that started it (a sealed, HttpOnly,
  SameSite=Strict cookie binds them), so a link sent to someone else cannot be finished by an attacker.
- Sign-in starts are rate limited per client address and globally, below Orgo's own limit, using the address appended
  by the trusted proxy (`TRUSTED_PROXY_HOPS`).
- After sign-in, only same-origin relative paths are honoured as the return location.
- The local development identity (`OPENMAN_DEV_BYPASS=1`) works only under `next dev` and only for loopback requests;
  a production server with it set refuses to start. `npm run dev` binds to 127.0.0.1.

## Requests

- **CSRF**: a state-changing request that carries the session cookie must come from this site's origin; bearer-token
  routes, webhooks and the scheduler carry no cookie.
- **SSRF**: every server-side fetch of a user-supplied URL (custom connectors, RSS triggers, outgoing webhooks,
  inbound mail bodies) goes through one safe fetch that allows only http(s), resolves the host and refuses private,
  loopback, link-local, metadata and other non-public addresses, pins the checked address, re-checks every redirect,
  and caps time and size.
- **Body size**: request bodies are size-checked while streaming; uploads go in bounded parts; recordings and their
  screenshots are capped in the database.
- **Errors**: clients get generic messages and a request id; details stay in the server log.
- **Headers**: a Content Security Policy, `X-Frame-Options: DENY`, HSTS, `nosniff`, a strict referrer policy, COOP,
  and a permissions policy that allows the microphone only inside the app. Scripts allow `'unsafe-inline'` because
  prerendered pages cannot carry a per-request nonce.
- **Rendering**: Markdown is rendered without raw HTML, links pass a scheme allow-list, and there is no
  `dangerouslySetInnerHTML`. Files served inline that could run script (HTML, SVG, XML) get a sandboxing CSP.
  Agent-built website previews run in a sandboxed iframe.

## Tenant isolation

- Every task, project, file, website, skill, recording, meeting, connector, automation, mailbox and phone number is
  looked up by the signed-in user's id.
- Computers named in a request are checked against the user's own Orgo workspace listing; changes to the home computer
  through the computers API are refused.
- Shared tasks and projects expose only what the owner shared; public share pages show redacted text and short tool
  previews, never the owner's email, id or instructions. Share tokens carry 144 bits of randomness.
- Website publishing only copies from the site's own folder, never hidden files or anything a symlink points outside
  of.

## Inbound channels

- AgentMail webhooks are verified with Svix signatures and AgentPhone webhooks with an HMAC, with constant-time
  comparison, a 300-second window and de-duplication. Without a configured secret they are refused.
- Only approved senders can start work by email or text. A phone call never starts a task on its own: the request is
  confirmed by a code sent by SMS to the calling number.
- Email automation triggers accept only clean mail, and by default only from the owner's own address.

## Spending limits

Vendors the operator pays for (phone numbers, SMS, call turns, agent inboxes and emails, transcription, speech, sound
effects, website invitations) are capped per user per day and month, enforced atomically in the database before each
vendor call (`src/config/usage-limits.ts`, override with `USAGE_LIMITS`). Model and compute spending happens on the
user's own Orgo credits.

## Known limitations

- **The agent is powerful by design.** It runs as an administrator on the user's computer with the tools and
  connectors the user enabled. Prompt injection from web pages, emails or files can make it misuse what that user has
  given it. Approvals, per-app desktop permissions and usage caps reduce this; they do not remove it.
- **The live desktop is not view-only at the protocol level.** Orgo provides one desktop password per computer, so
  "watch only" is enforced in the client. It is only ever given to the computer's owner.
- **Signed-in Orgo users share the server's sign-in budget.** Someone with many addresses can slow down new sign-ins
  for everyone until the hourly window resets.
- **SMS sender identity** can be spoofed in principle; texts that start work require the sender to be approved.
- **A self-hosted deployment is only as safe as its operator's setup**: keep secrets out of the repository, serve over
  HTTPS, keep sign-in on, use `INVITE_GATE=1` for anything public, and keep dependencies up to date.
