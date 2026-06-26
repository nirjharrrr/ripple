-- Ripple v2 — Supabase (Postgres) schema
-- Mirrors the v1 Google Sheets entities, but uses Supabase Auth for accounts and
-- real foreign keys. Run order: 0001_schema → 0002_rls → 0003_realtime_storage.
--
-- Design notes vs v1:
--   * Accounts live in Supabase Auth (auth.users). `profiles` holds public name/email.
--   * Rooms (v1 "teams") use membership.role for admin — the v1 per-room admin
--     PASSWORD is gone; real auth + RLS replaces it.
--   * Every table has Row Level Security (see 0002_rls.sql) — the Postgres
--     equivalent of v1's user_id / team_id scoping.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";        -- gen_random_uuid()

-- Touch updated_at on UPDATE.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------------------------------------------------------------------------
-- profiles — public mirror of auth.users (name/email for collaborators)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  -- claim any email-invited memberships waiting for this address
  update public.memberships
     set user_id = new.id
   where user_id is null and lower(email) = lower(new.email);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- teams (rooms)
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,   -- null until an email invite is claimed
  email        text not null default '',
  name         text not null default '',
  role         text not null default 'member' check (role in ('member','admin')),
  status       text not null default 'accepted' check (status in ('accepted','pending')),
  invite_token uuid,                       -- secret for the email accept link
  invited_by   uuid references public.profiles(id) on delete set null,
  invited_at   timestamptz,
  muted        boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists memberships_team_idx  on public.memberships(team_id);
create index if not exists memberships_user_idx  on public.memberships(user_id);
create index if not exists memberships_email_idx on public.memberships(lower(email));
create unique index if not exists memberships_invite_token_idx on public.memberships(invite_token) where invite_token is not null;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  name        text not null default '',
  color       text not null default '#6b7280',
  position    bigint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects(user_id);
create index if not exists projects_team_idx on public.projects(team_id);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  team_id       uuid references public.teams(id) on delete cascade,
  assignee_id   uuid references public.profiles(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  goal_id       uuid,                       -- soft ref (goals are private)
  depends_on    uuid references public.tasks(id) on delete set null,
  title         text not null default '',
  notes         text not null default '',
  done          boolean not null default false,
  is_today      boolean not null default false,
  archived      boolean not null default false,
  status        text not null default 'not_started',
  priority      text not null default 'normal',
  effort        text not null default '',
  estimate      text not null default '',
  tags          text not null default '',
  links         text not null default '',
  recurrence    text,
  due_at        timestamptz,
  remind_at     timestamptz,
  remind_offset integer not null default 0,
  reminded      boolean not null default false,
  position      bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tasks_user_idx     on public.tasks(user_id);
create index if not exists tasks_team_idx     on public.tasks(team_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_remind_idx   on public.tasks(remind_at) where remind_at is not null and reminded = false and done = false;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- subtasks
-- ---------------------------------------------------------------------------
create table if not exists public.subtasks (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  done        boolean not null default false,
  position    bigint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists subtasks_task_idx on public.subtasks(task_id);

-- ---------------------------------------------------------------------------
-- comments (on tasks)
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  author      text not null default '',
  body        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists comments_task_idx on public.comments(task_id);

-- ---------------------------------------------------------------------------
-- notes  (personal, or room-scoped when team_id is set)
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  position    bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes(user_id);
create index if not exists notes_team_idx on public.notes(team_id);
create trigger notes_touch before update on public.notes for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- goals & habits (strictly private)
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  description text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals(user_id);

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null default '',
  log         text not null default '',
  position    bigint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists habits_user_idx on public.habits(user_id);

-- ---------------------------------------------------------------------------
-- room sub-entities: decisions, discussions, files, messages
-- ---------------------------------------------------------------------------
create table if not exists public.decisions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  author      text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists decisions_team_idx on public.decisions(team_id);

create table if not exists public.discussions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.discussions(id) on delete cascade,
  body        text not null default '',
  author      text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists discussions_team_idx on public.discussions(team_id);

create table if not exists public.files (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null default '',
  url         text not null default '',
  storage_path text,                        -- set when stored in Supabase Storage
  created_at  timestamptz not null default now()
);
create index if not exists files_team_idx on public.files(team_id);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  author      text not null default '',
  body        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists messages_team_idx on public.messages(team_id, created_at);

-- ---------------------------------------------------------------------------
-- push_subs (Web Push subscriptions)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subs (
  endpoint    text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  p256dh      text not null default '',
  auth        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subs(user_id);
