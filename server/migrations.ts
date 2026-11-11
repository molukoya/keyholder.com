// Database migrations, applied in order at start-up (server/db.ts → migrate). Never edit one that has
// shipped: add a new one instead. Statements are separated by a semicolon at the end of a line.

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_init',
    sql: `
create table users (
  id uuid primary key,
  email text not null,
  name text not null default '',
  password_hash text,
  google_sub text unique,
  role text not null default 'owner' check (role in ('owner', 'admin', 'support')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  last_seen_at timestamptz,
  disabled_at timestamptz
);
create unique index users_email_key on users (lower(email));

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip text,
  user_agent text
);
create index sessions_user on sessions (user_id);

create table auth_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset', 'invite')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index auth_tokens_user on auth_tokens (user_id);

create table accounts (
  id uuid primary key,
  owner_id uuid not null unique references users(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'landlord')),
  trial_ends date,
  credit_cents integer not null default 0,
  notes jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table account_state (
  account_id uuid primary key references accounts(id) on delete cascade,
  revision integer not null,
  schema_version integer not null,
  data jsonb not null,
  summary jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text not null default 'app'
);

create table account_state_history (
  account_id uuid not null references accounts(id) on delete cascade,
  revision integer not null,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by text not null,
  primary key (account_id, revision)
);

create table message_deliveries (
  account_id uuid not null references accounts(id) on delete cascade,
  message_id text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, message_id)
);

create table outbox (
  id uuid primary key,
  account_id uuid references accounts(id) on delete set null,
  kind text not null,
  to_email text not null,
  to_name text,
  reply_to text,
  subject text not null,
  text_body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'logged', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  provider text,
  provider_id text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  send_after timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_due on outbox (status, send_after);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor text not null,
  account_id uuid,
  scope text not null default 'app',
  action text not null,
  detail text not null default '',
  ip text
);
create index audit_at on audit_log (at desc);
create index audit_account on audit_log (account_id, at desc);

create table support_tickets (
  id text primary key,
  account_id uuid references accounts(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  email text not null,
  name text not null default '',
  subject text not null,
  category text not null default 'question',
  priority text not null default 'normal',
  status text not null default 'open',
  assignee text not null default '',
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table announcements (
  id text primary key,
  text text not null,
  where_shown text not null check (where_shown in ('website', 'app', 'both')),
  tone text not null check (tone in ('info', 'warning')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create table data_requests (
  id uuid primary key,
  account_id uuid,
  email text not null,
  kind text not null check (kind in ('copy', 'delete')),
  status text not null default 'to do',
  received date not null default current_date,
  done_at timestamptz
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table system_errors (
  id uuid primary key,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  area text not null,
  message text not null,
  count integer not null default 1,
  resolved_at timestamptz
);
create unique index system_errors_open on system_errors (area, message) where resolved_at is null;

create table job_runs (
  job text primary key,
  last_run_at timestamptz not null,
  detail text not null default ''
);
`,
  },
  {
    id: '002_super_user',
    sql: `
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('owner', 'super', 'admin', 'support'));
alter table accounts add column if not exists unit_price_cents integer;

create table promotions (
  id uuid primary key,
  code text not null,
  kind text not null check (kind in ('percent', 'amount')),
  value integer not null check (value > 0),
  months integer not null default 1 check (months between 1 and 36),
  ends_on date,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create unique index promotions_code_key on promotions (upper(code));

create table secrets (
  name text primary key,
  ciphertext text not null,
  last4 text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
`,
  },
];
