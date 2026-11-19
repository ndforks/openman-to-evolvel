# Deploying OpenMan

An OpenMan deployment is three things:

1. **The web app**: a Next.js server (`next start`) on any host that runs Node.js 22 or later.
2. **A Supabase project** with the migrations in `supabase/migrations/` applied and the database secret registered.
3. **The scheduler worker**: `node scripts/worker.mjs`, a small process that calls `POST /api/cron/tick` once a minute.

Users' agents run on their own Orgo computers, so the app server itself needs little: 1 to 2 vCPU and 2 GB of memory
are enough to start (the production build is the heaviest step; build elsewhere if the host is smaller).

Placeholders below: `app.example.com` is your public host name, `/srv/openman` the install directory, `openman` the
system user that runs the app. Replace them with your own.

## 1. Database

1. Create a Supabase project. Note its URL and publishable key (Project Settings -> API). You do not need the
   service-role key; do not give it to the app.
2. Apply the schema, either with the Supabase CLI:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   or by pasting each file in `supabase/migrations/` (in name order) into the SQL editor.
3. Generate the app secrets and register the database secret's hash:
   ```bash
   cp .env.example .env.production   # fill in APP_PUBLIC_URL and the Supabase values
   node scripts/setup.mjs --env .env.production
   ```
   Run the `insert into private.server_secret ...` statement it prints in the SQL editor. Run it again whenever
   `APP_DB_SECRET` changes.
4. Use a separate Supabase project and separate secrets for each environment (for example staging and production).

## 2. Environment

The server needs the values in the "Required" section of `.env.example`, plus any optional integration you enable.
Keep the file readable only by the app user (`chmod 600`), outside the release directory, and never in git.

- `APP_PUBLIC_URL=https://app.example.com` (no trailing slash).
- Do **not** set `OPENMAN_DEV_BYPASS` (or the old `NEXT_PUBLIC_AUTH_DISABLED`) on a server: a production server with
  either set refuses to start.
- Set `INVITE_GATE=1` for any deployment reachable from the internet, at least until you have decided who may use it.
  The first account to sign in owns the invite list.
- `NEXT_PUBLIC_*` values are compiled into the build: rebuild after changing them.
- Set `TRUSTED_PROXY_HOPS` to the number of reverse proxies in front of the app that append to `X-Forwarded-For`
  (default 1).

## 3. Build and run on a Linux host

```bash
# once
sudo useradd --system --create-home --home-dir /srv/openman openman
sudo -u openman mkdir -p /srv/openman/releases /srv/openman/shared/data

# each release
REL=/srv/openman/releases/$(date -u +%Y%m%dT%H%M%SZ)
sudo -u openman git clone --depth 1 https://github.com/OrgoAI/openman.git "$REL"
cd "$REL"
sudo -u openman npm ci --no-audit --no-fund
sudo -u openman bash -c 'set -a; . /srv/openman/shared/env.production; set +a; npx next build'
sudo -u openman ln -sfn "$REL" /srv/openman/current
sudo systemctl restart openman openman-worker
```

Keep the previous release directories: rolling back is pointing `current` at the previous one and restarting both
services. Migrations are additive, so rolling back code does not need a database change.

### Services (systemd)

`/etc/systemd/system/openman.service`:

```ini
[Unit]
Description=OpenMan web
After=network-online.target

[Service]
User=openman
WorkingDirectory=/srv/openman/current
EnvironmentFile=/srv/openman/shared/env.production
Environment=NODE_ENV=production PORT=3000 OPENMAN_DATA_DIR=/srv/openman/shared/data
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/openman-worker.service`:

```ini
[Unit]
Description=OpenMan scheduler worker
After=openman.service

[Service]
User=openman
WorkingDirectory=/srv/openman/current
EnvironmentFile=/srv/openman/shared/env.production
Environment=NODE_ENV=production APP_URL=http://127.0.0.1:3000
ExecStart=/usr/bin/node scripts/worker.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now openman openman-worker
```

Hosts without systemd can use supervisord, pm2 or a container's process manager with the same two commands.

### HTTPS

Put a reverse proxy in front of port 3000 that terminates TLS for `app.example.com` (Caddy, nginx, a cloud load
balancer). Example with Caddy:

```
app.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

The proxy must pass `Host` and append the client address to `X-Forwarded-For`, and must not buffer server-sent events
(Caddy does not; for nginx set `proxy_buffering off` for `/api/`).

## 4. Running on an Orgo computer

You can host the app itself on an Orgo Linux computer, which keeps everything in one account:

1. Create a Linux computer in a workspace you use only for hosting, and turn auto-stop off so it stays up.
2. Install Node.js 22 or later on it and follow section 3. Orgo images may use supervisord instead of systemd; create
   one program for `next start` and one for `scripts/worker.mjs` with the same commands and environment.
3. Publish port 3000 through an Orgo public URL with link access (ports used by Orgo itself cannot be published; 3000
   works). Set `APP_PUBLIC_URL` to that URL, or to your own domain if you point one at it, and set
   `TRUSTED_PROXY_HOPS=1`.
4. Never run users' agents on the hosting computer: each user's agent runs on that user's own computer.

## 5. Other platforms

- **Managed Node hosts** (any platform that runs `npm run build` and `npm start`): set the environment in the
  platform's settings and run the worker as a second, always-on process. If the platform cannot run one, call
  `POST https://app.example.com/api/cron/tick` with `Authorization: Bearer $CRON_SECRET` once a minute from any
  scheduler; ticks are safe to overlap.
- **Serverless platforms**: long-lived event streams and the local task cache in `OPENMAN_DATA_DIR` assume a
  persistent server process. Serverless hosting is not tested.

## 6. Vendor webhooks (optional integrations)

If you enable agent email or phone, register a webhook at the vendor that points at your deployment and put its
signing secret in the env:

- AgentMail: `https://app.example.com/api/webhooks/agentmail` -> `AGENTMAIL_WEBHOOK_SECRET`
- AgentPhone: `https://app.example.com/api/webhooks/agentphone` -> `AGENTPHONE_WEBHOOK_SECRET`

Requests without a valid signature are refused, and the endpoints answer 503 until the secret is set.

## 7. After deploying

1. `curl https://app.example.com/api/health` returns 200.
2. `curl -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/health/deep` returns 200, and its
   scheduler tick is recent.
3. Sign in, which makes you the invite-list owner if `INVITE_GATE=1`, and open `/app/admin`.
4. Point an uptime monitor at `/api/health/deep` and set `OPS_ALERT_WEBHOOK_URL` for alerts.

Day-to-day operations (secret rotation, restores, stuck queues) are in [OPERATIONS.md](OPERATIONS.md).
