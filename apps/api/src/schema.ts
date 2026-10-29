export const SCHEMA_SQL = `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  display_name text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Added later: email verification. Separate statements so existing databases
-- upgrade themselves on the next boot without a manual migration.
alter table users add column if not exists email_verified boolean not null default false;
update users set email_verified = true where role = 'admin' and email_verified = false;

create table if not exists auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('verify_email', 'reset_password')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_tokens_user_idx on auth_tokens (user_id, kind);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  skill text not null,
  content_id text not null,
  mode text not null default 'practice',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_sec integer,
  raw_score integer,
  total integer,
  band numeric(3,1),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists attempts_user_idx on attempts (user_id, started_at desc);

create table if not exists responses (
  id bigserial primary key,
  attempt_id uuid not null references attempts(id) on delete cascade,
  question_id text not null,
  answer jsonb,
  is_correct boolean,
  unique (attempt_id, question_id)
);

create table if not exists writing_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content_id text not null,
  task_id text not null,
  text text not null,
  word_count integer not null,
  ai_feedback jsonb,
  ai_band numeric(3,1),
  created_at timestamptz not null default now()
);

create index if not exists writing_user_idx on writing_submissions (user_id, created_at desc);

create table if not exists speaking_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content_id text not null,
  part integer not null,
  prompt text,
  duration_sec integer,
  created_at timestamptz not null default now()
);

create table if not exists ai_usage (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_idx on ai_usage (user_id, created_at desc);

-- Questions the user answered correctly after review, so they stop showing up.
create table if not exists review_mastered (
  user_id uuid not null references users(id) on delete cascade,
  content_id text not null,
  question_id text not null,
  mastered_at timestamptz not null default now(),
  primary key (user_id, content_id, question_id)
);
`;
