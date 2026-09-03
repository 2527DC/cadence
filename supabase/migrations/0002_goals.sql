-- 0002_goals.sql
-- Source of truth: doc/03-data-model-supabase.md §3.2
--
-- Goals are never hard-deleted. There is no DELETE policy in 0010 and no DELETE grant.
-- Archive instead (state = 'archived'), which keeps every historical task and its
-- analytics intact.

create table goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  title           text not null check (length(trim(title)) between 3 and 120),
  description     text,
  category        text,
  color           text default '#4F46E5',
  target_per_week smallint not null default 1 check (target_per_week between 1 and 50),
  start_week      date not null,                     -- always a Monday
  end_week        date,
  state           goal_state not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint start_week_is_monday check (extract(isodow from start_week) = 1),
  constraint end_week_is_monday   check (end_week is null or extract(isodow from end_week) = 1),
  constraint end_after_start      check (end_week is null or end_week >= start_week)
);

create index goals_user_idx  on goals (user_id, state);
create index goals_state_idx on goals (user_id) where state = 'active';
