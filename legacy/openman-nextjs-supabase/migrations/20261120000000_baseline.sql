-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Organic Intelligence, Inc.
--
-- OpenMan database baseline for a new Supabase project.
--
-- Access model: only the app server talks to the database. It uses the publishable key plus the header
-- `x-om-secret: $APP_DB_SECRET`. Row-level security admits a request only when private.is_server() is true: the
-- SHA-256 hex of that header equals the single row in private.server_secret. That row is set per environment, outside
-- the migrations (`node scripts/setup.mjs` prints the statement), so no secret or hash appears here. Browsers get
-- nothing: the `authenticated` role has no grants or policies, and `anon` passes only with the server header.
-- Every row carries the Orgo user id as text; server code scopes every query by it.
--
-- Later schema changes go in new, additive migration files after this one.

-- =================================================================================================================
-- Server check and shared helpers
-- =================================================================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- The allowed hash is a row, not a literal: each environment sets its own.
create table private.server_secret (
  id integer primary key default 1 check (id = 1),
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  set_at timestamptz not null default now()
);
revoke all on private.server_secret from public, anon, authenticated;

create or replace function private.is_server()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    encode(
      sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-om-secret', ''), 'UTF8')),
      'hex'
    ) = (select s.sha256_hex from private.server_secret s where s.id = 1),
    false
  );
$$;
revoke all on function private.is_server() from public;
grant execute on function private.is_server() to anon, authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- An update that sets updated_at itself keeps its value; any other update is stamped now.
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- =================================================================================================================
-- Accounts, projects, tasks
-- =================================================================================================================

create table public.accounts (
  user_id text primary key,
  email text not null default '',
  name text not null default '',
  -- Sealed with APP_ENCRYPTION_KEY (src/lib/crypto.ts).
  orgo_key_enc text,
  workspace_id text,
  home_computer_id text,
  hermes_base_url text,
  hermes_key_enc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Provisioning progress of the user's home computer (src/lib/provision).
  setup_version integer not null default 0,
  setup_steps jsonb not null default '{}'::jsonb,
  setup_at timestamptz
);

create table public.projects (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  name text not null check (char_length(name) between 1 and 200),
  instructions text not null default '',
  connectors text[] not null default '{}',
  skills text[] not null default '{}',
  pinned boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The working folder chosen in "Create project", and where it lives.
  folder text not null default '',
  computer text check (computer in ('local', 'cloud'))
);
create index projects_user_order_idx on public.projects (user_id, pinned desc, sort_order, created_at);

create table public.project_files (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects (id) on delete cascade,
  user_id text not null,
  name text not null,
  mime text,
  size integer not null default 0,
  -- Small reference files only (the API caps them); `encoding` says how `content` is stored.
  encoding text not null default 'utf8' check (encoding in ('utf8', 'base64')),
  content text not null default '',
  created_at timestamptz not null default now()
);
create index project_files_project_idx on public.project_files (user_id, project_id, created_at);
create index project_files_project_fk_idx on public.project_files (project_id);

-- Project sharing: the owner invites signed-in people by email as `editor` (may change instructions and files) or
-- `member` (gets the instructions and files, starts tasks in the project, sees only the tasks they created).
-- `member_id` is filled the first time the invitee opens the project signed in with that email.
create table public.project_members (
  project_id text not null references public.projects (id) on delete cascade,
  owner_id text not null,
  email text not null check (email = lower(email) and length(email) between 3 and 320),
  member_id text,
  role text not null default 'member' check (role in ('editor', 'member')),
  invited_by text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);
create index project_members_email_idx on public.project_members (email);
create index project_members_member_idx on public.project_members (member_id) where member_id is not null;
create index project_members_owner_idx on public.project_members (owner_id, project_id);

-- Self-updating projects: changes the agent proposed from a task, applied only after someone who may edit approves.
create table public.project_proposals (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects (id) on delete cascade,
  owner_id text not null,
  task_id text not null,
  proposed_by text not null,
  status text not null default 'open' check (status in ('open', 'applied', 'dismissed')),
  summary text not null default '' check (char_length(summary) <= 2000),
  changes jsonb not null default '{}'::jsonb,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index project_proposals_project_idx on public.project_proposals (project_id, created_at desc);

create table public.tasks (
  id text primary key,
  user_id text not null,
  title text not null,
  status text not null default 'waking'
    check (status in ('waking', 'running', 'waiting', 'stopped', 'completed', 'error')),
  mode text not null default 'standard',
  effort text,
  project_id text references public.projects (id) on delete set null,
  favorite boolean not null default false,
  archived boolean not null default false,
  target jsonb,
  computer_id text,
  hermes_session_id text,
  -- Server-side run state (speed, run id, queue, files, fallback model). Never sent to browsers.
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Stamped by the app (list order follows activity, not edits such as a rename), so no touch trigger.
  updated_at timestamptz not null default now(),
  -- Sidebar state: pinned (with when, for ordering) and unread.
  pinned_at timestamptz,
  unread boolean not null default false
);
create index tasks_user_updated_idx on public.tasks (user_id, updated_at desc);
create index tasks_user_project_idx on public.tasks (user_id, project_id) where project_id is not null;
create index tasks_project_fk_idx on public.tasks (project_id);
create index tasks_user_pinned_idx on public.tasks (user_id, pinned_at) where pinned_at is not null;
-- Child tasks (parallel tasks, side chats) are found through their parent.
create index tasks_user_parent_idx on public.tasks (user_id, (meta->>'parentTaskId')) where meta ? 'parentTaskId';

create table public.task_events (
  task_id text not null references public.tasks (id) on delete cascade,
  seq bigint not null,
  user_id text not null,
  at timestamptz not null default now(),
  type text not null,
  payload jsonb not null,
  primary key (task_id, seq)
);
create index task_events_user_idx on public.task_events (user_id);

create table public.task_files (
  id text primary key default gen_random_uuid()::text,
  task_id text not null references public.tasks (id) on delete cascade,
  user_id text not null,
  file_id text not null,
  name text not null,
  path text not null default '',
  mime text,
  size bigint,
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, file_id)
);
create index task_files_user_idx on public.task_files (user_id, task_id);

-- Task collaboration: people the owner invited (by email) to read and prompt one task. The owner's account pays.
-- `user_id` is filled in the first time the invitee opens the task signed in with that email.
create table public.task_members (
  task_id text not null,
  owner_id text not null,
  email text not null check (email = lower(email) and length(email) between 3 and 320),
  user_id text,
  role text not null default 'collaborator' check (role in ('collaborator')),
  invited_by text not null,
  created_at timestamptz not null default now(),
  primary key (task_id, email),
  foreign key (task_id) references public.tasks (id) on delete cascade
);
create index task_members_email_idx on public.task_members (email);
create index task_members_user_idx on public.task_members (user_id) where user_id is not null;
create index task_members_owner_idx on public.task_members (owner_id, task_id);

create table public.knowledge (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  name text not null check (char_length(name) between 1 and 200),
  when_to_use text not null default '',
  content text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_user_idx on public.knowledge (user_id, created_at);

create table public.settings (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.shares (
  id text primary key default gen_random_uuid()::text,
  task_id text not null unique references public.tasks (id) on delete cascade,
  user_id text not null,
  token text not null unique,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shares_user_idx on public.shares (user_id);

create table public.notifications (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  kind text not null default 'info',
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- =================================================================================================================
-- Automations
-- =================================================================================================================

create table public.automations (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  name text not null,
  prompt text not null default '',
  schedule text not null default '',
  timezone text not null default 'UTC',
  mode text not null default 'standard',
  project_id text references public.projects (id) on delete set null,
  connectors text[] not null default '{}',
  enabled boolean not null default true,
  -- Orgo schedule id on the user's home computer, once registered there.
  external_id text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null default 'schedule' check (kind in ('schedule', 'trigger', 'advanced')),
  repeat jsonb not null default '{}'::jsonb,
  ends_at timestamptz,
  triggers jsonb not null default '[]'::jsonb,
  trigger_state jsonb not null default '{}'::jsonb,
  run_in text not null default 'new' check (run_in in ('new', 'same')),
  task_id text references public.tasks (id) on delete set null,
  source_task_id text references public.tasks (id) on delete set null,
  failure_count integer not null default 0,
  paused_reason text,
  hook_token text unique,
  poll_at timestamptz
);
create index automations_user_idx on public.automations (user_id, created_at);
create index automations_due_idx on public.automations (next_run_at) where enabled;
create index automations_project_idx on public.automations (project_id) where project_id is not null;
create index automations_poll_idx on public.automations (poll_at) where enabled;
create index automations_task_idx on public.automations (task_id);
create index automations_source_task_idx on public.automations (source_task_id);

create table public.automation_runs (
  id text primary key default gen_random_uuid()::text,
  automation_id text not null references public.automations (id) on delete cascade,
  user_id text not null,
  task_id text references public.tasks (id) on delete set null,
  status text not null default 'running' check (status in ('queued', 'running', 'completed', 'failed', 'stopped')),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary text,
  trigger text not null default 'schedule',
  scheduled_for timestamptz,
  attempt integer not null default 1,
  retry_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);
create index automation_runs_idx on public.automation_runs (user_id, automation_id, started_at desc);
create index automation_runs_automation_idx on public.automation_runs (automation_id);
create index automation_runs_task_idx on public.automation_runs (task_id) where task_id is not null;
-- One run per automation per due time: two ticks racing for the same slot cannot both fire it.
create unique index automation_runs_slot_idx on public.automation_runs (automation_id, scheduled_for, attempt) where scheduled_for is not null;
create index automation_runs_open_idx on public.automation_runs (status, retry_at) where status in ('queued', 'running');

-- =================================================================================================================
-- Agent email (AgentMail) and agent phone (AgentPhone)
-- =================================================================================================================

create table public.mailboxes (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  address text not null unique,
  display_name text not null default '',
  provider text not null default 'agentmail',
  external_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A personal address, or a workflow address that starts tasks with `default_prompt`.
  kind text not null default 'personal' check (kind in ('personal', 'workflow')),
  name text not null default '',
  default_prompt text not null default '',
  pod_id text,
  address_changed_at timestamptz
);
create index mailboxes_user_idx on public.mailboxes (user_id);
create unique index mailboxes_external_idx on public.mailboxes (external_id) where external_id is not null;
create unique index mailboxes_one_personal_idx on public.mailboxes (user_id) where kind = 'personal';

-- Approved senders (max 10 per user, enforced in code).
create table public.mail_senders (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

-- Every inbound and outbound mail handled, including blocked mail kept for review.
create table public.mail_messages (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  mailbox_id text references public.mailboxes (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null check (status in ('task', 'continued', 'blocked', 'sent', 'failed', 'ignored')),
  inbox_id text not null,
  message_id text,
  thread_id text,
  sender text not null default '',
  subject text not null default '',
  preview text not null default '',
  reason text,
  task_id text references public.tasks (id) on delete set null,
  created_at timestamptz not null default now()
);
create index mail_messages_user_idx on public.mail_messages (user_id, created_at desc);

-- One task per mail thread; CC'd people are participants of the task.
create table public.mail_threads (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  inbox_id text not null,
  thread_id text not null,
  task_id text references public.tasks (id) on delete cascade,
  last_message_id text,
  participants text[] not null default '{}',
  replied_seq integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inbox_id, thread_id)
);
create index mail_threads_task_idx on public.mail_threads (task_id);

-- Rate counter for workflow address create/delete operations.
create table public.mail_ops (
  id bigint generated always as identity primary key,
  user_id text not null,
  op text not null,
  created_at timestamptz not null default now()
);
create index mail_ops_user_idx on public.mail_ops (user_id, created_at desc);

create table public.phone_numbers (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  number text not null unique,
  label text not null default '',
  provider text not null default 'agentphone',
  external_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_id text,
  status text not null default 'active' check (status in ('active', 'released')),
  outbound_sms text,
  released_at timestamptz,
  -- Phone numbers that may text or call the agent.
  approved_senders text[] not null default '{}'
);
create index phone_numbers_user_idx on public.phone_numbers (user_id);
create unique index phone_numbers_external_idx on public.phone_numbers (external_id) where external_id is not null;
-- One active number per user.
create unique index phone_numbers_one_active_idx on public.phone_numbers (user_id) where status = 'active';

create table public.phone_messages (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  number_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  counterpart text not null,
  body text not null default '',
  status text not null check (status in ('received', 'blocked', 'awaiting_approval', 'approved', 'denied', 'sent', 'failed')),
  task_id text references public.tasks (id) on delete set null,
  provider_message_id text,
  approval_code text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index phone_messages_user_idx on public.phone_messages (user_id, created_at desc);
create index phone_messages_task_idx on public.phone_messages (task_id);

create table public.phone_calls (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  number_id text,
  call_id text not null unique,
  counterpart text not null default '',
  direction text not null default 'inbound',
  status text not null default 'in-progress',
  task_id text references public.tasks (id) on delete set null,
  summary text,
  duration_seconds integer,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  -- A call never starts a task by itself: the request waits here until `YES <confirm_code>` arrives by SMS.
  pending_prompt text,
  confirm_code text
);
create index phone_calls_user_idx on public.phone_calls (user_id, started_at desc);

-- Webhook de-duplication (both vendors).
create table public.webhook_receipts (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- Slack and Telegram links per user.
create table public.channel_links (
  user_id text not null,
  channel text not null check (channel in ('telegram','slack')),
  computer_id text,
  external_name text,
  external_id text,
  secret_enc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, channel)
);

-- =================================================================================================================
-- Websites
-- =================================================================================================================

-- Websites built by the agent on the user's Orgo computer. Preview and publish are both Orgo app URLs on that computer.
create table public.websites (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  name text not null,
  slug text unique,
  task_id text references public.tasks (id) on delete set null,
  computer_id text,
  url text,
  status text not null default 'draft'
    check (status in ('building', 'ready', 'draft', 'publishing', 'published', 'failed', 'unpublished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  folder text,
  template text,
  dev_port integer,
  prod_port integer,
  preview_url text,
  published_url text,
  visibility text not null default 'public',
  auto_publish boolean not null default false,
  show_badge boolean not null default true,
  published_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  constraint websites_visibility_check check (visibility in ('public', 'invite', 'private'))
);
create index websites_user_idx on public.websites (user_id, created_at desc);
create index websites_task_idx on public.websites (task_id) where task_id is not null;

-- Named secrets for a website. Values are sealed with APP_ENCRYPTION_KEY and never returned to a browser; the server
-- writes them to the site's `.env` on the user's own computer when the site starts.
create table public.website_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  website_id text not null references public.websites (id) on delete cascade,
  name text not null check (name ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  value_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index website_secrets_name_idx on public.website_secrets (user_id, website_id, name);
create index website_secrets_site_idx on public.website_secrets (website_id);

-- =================================================================================================================
-- Connectors and skills (the apps and skills themselves live on the user's computer)
-- =================================================================================================================

-- Custom MCP servers and custom APIs (key sealed with APP_ENCRYPTION_KEY).
create table public.custom_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('mcp', 'api')),
  name text not null,
  -- 'mcp': 'http' (url) or 'command' (runs on the user's computer); 'api': null.
  transport text check (transport in ('http', 'command')),
  url text,
  command text,
  args jsonb not null default '[]'::jsonb,
  -- Sealed JSON: MCP headers, or the API key. Never returned to a browser.
  secret_enc text,
  -- API: the header the key goes in (Authorization: Bearer by default).
  auth_header text,
  -- The server's slug in Hermes' mcp_servers on the user's computer.
  server_name text not null,
  tools jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  status_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index custom_connectors_user_idx on public.custom_connectors (user_id, created_at);
create unique index custom_connectors_server_name_idx on public.custom_connectors (user_id, server_name);

create table public.project_connectors (
  user_id text not null,
  project_id text not null,
  connectors text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create table public.project_skills (
  user_id text not null,
  project_id text not null,
  skills text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

-- "Build from a task": a finished task the agent was asked to package as a skill.
create table public.skill_builds (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task_id text not null,
  skill_name text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index skill_builds_user_idx on public.skill_builds (user_id, created_at desc);

-- =================================================================================================================
-- Recorded demonstrations ("Record a skill") and meetings
-- =================================================================================================================

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text not null default '',
  status text not null default 'recording' check (status in ('recording', 'review', 'processing', 'done', 'failed')),
  computer_id text,
  screen_w integer,
  screen_h integer,
  -- The reviewed steps (array of step objects); null until the recording is finished.
  steps jsonb,
  task_id text,
  skill_name text,
  detail text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recordings_user_idx on public.recordings (user_id, created_at desc);

-- Raw timeline, appended by the browser in numbered parts while recording.
create table public.recording_parts (
  recording_id uuid not null references public.recordings (id) on delete cascade,
  seq integer not null,
  user_id text not null,
  events jsonb not null,
  created_at timestamptz not null default now(),
  primary key (recording_id, seq),
  constraint recording_parts_seq_bound check (seq >= 0 and seq < 5000)
);

-- Screenshots (JPEG, base64) captured around actions.
create table public.recording_images (
  recording_id uuid not null references public.recordings (id) on delete cascade,
  key text not null,
  user_id text not null,
  mime text not null default 'image/jpeg',
  width integer,
  height integer,
  data text not null,
  created_at timestamptz not null default now(),
  primary key (recording_id, key)
);

-- At most 300 screenshots per recording.
create or replace function private.recording_images_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('om_recimg:' || new.recording_id::text));
  if (select count(*) from public.recording_images i where i.recording_id = new.recording_id) >= 300 then
    raise exception 'recording image limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger recording_images_cap before insert on public.recording_images for each row execute function private.recording_images_cap();

-- At most 200 recordings per user.
create or replace function private.recordings_per_user_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('om_rec:' || new.user_id));
  if (select count(*) from public.recordings r where r.user_id = new.user_id) >= 200 then
    raise exception 'recording limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger recordings_per_user_cap before insert on public.recordings for each row execute function private.recordings_per_user_cap();

-- Meeting recordings and uploaded audio or video turned into notes. The audio lives on the user's own computer; this
-- row tracks the upload, the transcription job and the task.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'Meeting',
  source text not null default 'recording' check (source in ('recording', 'upload')),
  status text not null default 'uploading' check (status in ('uploading', 'transcribing', 'summarizing', 'done', 'error')),
  file_name text not null,
  mime text,
  size_bytes bigint not null default 0,
  part_size integer not null default 4194304,
  parts_total integer not null default 0,
  parts_done integer[] not null default '{}',
  computer_id text,
  guest_dir text,
  provider text,
  speakers boolean not null default false,
  progress jsonb,
  transcript jsonb,
  task_id text,
  error text,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meetings_user_idx on public.meetings (user_id, created_at desc);

-- =================================================================================================================
-- Public developer API (/api/v1) and outgoing webhooks
-- =================================================================================================================

create table public.api_keys (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  name text not null,
  prefix text not null,
  -- SHA-256 of the key; the key itself is shown once and never stored.
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index api_keys_user_idx on public.api_keys (user_id);

create table public.webhooks (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  url text not null,
  events text[] not null default '{}',
  secret_enc text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index webhooks_user_idx on public.webhooks (user_id);

create table public.api_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create table public.api_idempotency (
  user_id text not null,
  key text not null,
  fingerprint text not null,
  status integer,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index api_idempotency_created_idx on public.api_idempotency (created_at);

create table public.api_tasks (
  task_id text primary key,
  user_id text not null,
  api_key_id text,
  output_schema jsonb,
  structured_state text not null default 'none',
  structured_request_seq bigint,
  structured_output jsonb,
  structured_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_tasks_user_idx on public.api_tasks (user_id);
create index api_tasks_open_idx on public.api_tasks (structured_state) where structured_state in ('pending', 'requested');

create table public.webhook_deliveries (
  id text primary key default (gen_random_uuid())::text,
  webhook_id text not null references public.webhooks (id) on delete cascade,
  user_id text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (webhook_id, event_id)
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_user_idx on public.webhook_deliveries (user_id, created_at desc);

create table public.api_outbox_state (
  id text primary key,
  scanned_to timestamptz not null
);

-- Atomic fixed-window counter. Security invoker: RLS still requires the server header.
create or replace function public.api_rate_hit(p_bucket text, p_window timestamptz)
returns integer
language sql
security invoker
set search_path = public
as $$
  insert into public.api_rate_limits as r (bucket, window_start, count)
  values (p_bucket, p_window, 1)
  on conflict (bucket, window_start) do update set count = r.count + 1
  returning r.count;
$$;

-- =================================================================================================================
-- Security: revocations, usage caps, invite list
-- =================================================================================================================

-- "Sign out everywhere", account deletion and the automations tool token write here, never to the user-editable
-- settings document. Kept when an account is deleted.
create table public.revocations (
  user_id text primary key,
  sessions_revoked_at timestamptz,
  automations_not_before timestamptz,
  updated_at timestamptz not null default now()
);

-- Usage caps for vendors the operator pays for (src/config/usage-limits.ts).
create table public.usage_counters (
  user_id text not null,
  metric text not null,
  period text not null check (period in ('day', 'month')),
  period_start date not null,
  amount bigint not null default 0,
  primary key (user_id, metric, period, period_start)
);

-- Atomically adds `p_amount` to today's and this month's counters when both stay within their limits.
-- Returns ok=false (and changes nothing) when either limit would be passed. Security invoker: RLS applies.
create or replace function public.usage_consume(p_user text, p_metric text, p_amount bigint, p_day_limit bigint, p_month_limit bigint)
returns table (ok boolean, day_used bigint, month_used bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d date := (now() at time zone 'utc')::date;
  m date := date_trunc('month', now() at time zone 'utc')::date;
  du bigint;
  mu bigint;
begin
  insert into public.usage_counters (user_id, metric, period, period_start) values (p_user, p_metric, 'day', d), (p_user, p_metric, 'month', m)
  on conflict do nothing;
  select c.amount into du from public.usage_counters c where c.user_id = p_user and c.metric = p_metric and c.period = 'day' and c.period_start = d for update;
  select c.amount into mu from public.usage_counters c where c.user_id = p_user and c.metric = p_metric and c.period = 'month' and c.period_start = m for update;
  if du + p_amount > p_day_limit or mu + p_amount > p_month_limit then
    return query select false, du, mu;
    return;
  end if;
  update public.usage_counters c set amount = c.amount + p_amount where c.user_id = p_user and c.metric = p_metric and ((c.period = 'day' and c.period_start = d) or (c.period = 'month' and c.period_start = m));
  return query select true, du + p_amount, mu + p_amount;
end;
$$;

-- Invite list (INVITE_GATE=1). A signed-in Orgo user is admitted when their Orgo user id or email is listed. The first
-- account to sign in to an empty list becomes its owner. The list lives only in the database.
create table public.invites (
  id text primary key default gen_random_uuid()::text,
  orgo_user_id text unique,
  email text unique check (email is null or email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'member')),
  added_by text,
  created_at timestamptz not null default now(),
  check (orgo_user_id is not null or email is not null)
);
create unique index invites_one_owner_idx on public.invites (role) where role = 'owner';

-- 'owner' | 'member' when admitted, null otherwise. Claims ownership of an empty list atomically.
create or replace function public.invite_admit(p_user_id text, p_email text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e text := nullif(lower(trim(coalesce(p_email, ''))), '');
  r public.invites%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('om_invites'));
  select * into r from public.invites i where i.orgo_user_id = p_user_id or (e is not null and i.email = e) order by (i.orgo_user_id = p_user_id) desc nulls last limit 1;
  if found then
    if r.orgo_user_id is null then update public.invites set orgo_user_id = p_user_id where id = r.id; end if;
    return r.role;
  end if;
  if not exists (select 1 from public.invites) then
    insert into public.invites (orgo_user_id, email, role, added_by) values (p_user_id, e, 'owner', 'first-sign-in');
    return 'owner';
  end if;
  return null;
end;
$$;

-- =================================================================================================================
-- Observability (docs/OPERATIONS.md)
-- =================================================================================================================

-- Warnings and errors from src/lib/observability/log.ts. No raw user ids (user_hash is an HMAC), no secrets (a
-- redaction pass runs before insert). Rows older than 30 days are deleted by the scheduler tick.
create table public.ops_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  level text not null check (level in ('warn', 'error')),
  event text not null,
  user_hash text,
  task_id text,
  request_id text,
  duration_ms integer,
  error_class text,
  message text,
  data jsonb
);
create index ops_events_at_idx on public.ops_events (at desc);
create index ops_events_event_at_idx on public.ops_events (event, at desc);

-- Last time a periodic job ran ("cron.tick"), with a small summary.
create table public.ops_heartbeats (
  name text primary key,
  at timestamptz not null default now(),
  detail jsonb
);

-- One row per alert kind, so an alert is sent at most once per cooldown.
create table public.ops_alerts (
  key text primary key,
  last_sent_at timestamptz not null default now(),
  last_detail text,
  count integer not null default 1
);

-- Model spend per task, priced from the token usage stored on `run.completed` events.
create table public.task_costs (
  task_id text primary key,
  user_id text not null,
  model text not null,
  mode text,
  runs integer not null default 0,
  priced_runs integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(14, 6) not null default 0,
  basis text not null,
  last_event_at timestamptz,
  computed_at timestamptz not null default now()
);
create index task_costs_user_idx on public.task_costs (user_id, computed_at desc);

-- =================================================================================================================
-- updated_at triggers, row-level security, grants
-- =================================================================================================================

do $$
declare
  t text;
begin
  -- Tables whose updated_at the database stamps. (tasks, webhooks, api_tasks and channel_links are stamped by the app.)
  foreach t in array array['accounts', 'projects', 'task_files', 'knowledge', 'settings', 'shares', 'automations',
                           'mailboxes', 'phone_numbers', 'websites', 'mail_threads', 'phone_messages', 'phone_calls',
                           'custom_connectors', 'project_connectors', 'project_skills', 'skill_builds', 'recordings',
                           'meetings', 'website_secrets'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
                   t || '_touch', t);
  end loop;

  -- Every table: RLS on, no access for browsers, full access for the server (anon + x-om-secret) only.
  foreach t in array array['accounts', 'projects', 'project_files', 'project_members', 'project_proposals', 'tasks',
                           'task_events', 'task_files', 'task_members', 'knowledge', 'settings', 'shares',
                           'notifications', 'automations', 'automation_runs', 'mailboxes', 'mail_senders',
                           'mail_messages', 'mail_threads', 'mail_ops', 'phone_numbers', 'phone_messages',
                           'phone_calls', 'webhook_receipts', 'channel_links', 'websites', 'website_secrets',
                           'custom_connectors', 'project_connectors', 'project_skills', 'skill_builds', 'recordings',
                           'recording_parts', 'recording_images', 'meetings', 'api_keys', 'webhooks',
                           'api_rate_limits', 'api_idempotency', 'api_tasks', 'webhook_deliveries',
                           'api_outbox_state', 'revocations', 'usage_counters', 'invites', 'ops_events',
                           'ops_heartbeats', 'ops_alerts', 'task_costs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to anon', t);
    execute format('create policy %I on public.%I for all to anon using ((select private.is_server())) with check ((select private.is_server()))',
                   'server only', t);
  end loop;
end
$$;

grant usage on sequence public.mail_ops_id_seq to anon;
grant usage on sequence public.ops_events_id_seq to anon;

revoke all on function public.api_rate_hit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.api_rate_hit(text, timestamptz) to anon;
revoke all on function public.usage_consume(text, text, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.usage_consume(text, text, bigint, bigint, bigint) to anon;
revoke all on function public.invite_admit(text, text) from public, anon, authenticated;
grant execute on function public.invite_admit(text, text) to anon;
