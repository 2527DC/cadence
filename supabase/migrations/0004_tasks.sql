-- 0004_tasks.sql
-- Source of truth: doc/03-data-model-supabase.md §3.3
--
-- The check constraints here are the first of three layers protecting the record.
-- Layer 2 is the triggers (0006); layer 3 is RLS (0010).

create table tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  goal_id       uuid references goals(id) on delete restrict,   -- restrict: goals can't vanish
  title         text not null check (length(trim(title)) between 3 and 200),
  detail        text,
  week_start    date not null,
  planned_for   date,
  weight        smallint not null default 1 check (weight between 1 and 5),  -- OQ-8: column now, UI later

  is_finalized  boolean not null default false,
  finalized_at  timestamptz,
  late_add      boolean not null default false,     -- finalized after Wednesday of its week

  status        task_status not null default 'OPEN',
  closed_at     timestamptz,
  nc_reason     nc_reason,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint week_start_is_monday check (extract(isodow from week_start) = 1),
  constraint planned_within_week  check (
    planned_for is null
    or (planned_for >= week_start and planned_for < week_start + 7)
  ),
  constraint finalized_has_timestamp check (
    (is_finalized = false and finalized_at is null)
    or (is_finalized = true and finalized_at is not null)
  ),
  -- a draft can never carry a closing status
  constraint draft_is_open check (is_finalized = true or status = 'OPEN'),
  -- NC must state a reason
  constraint nc_needs_reason check (
    (status = 'NC' and nc_reason is not null)
    or (status <> 'NC' and nc_reason is null)
  ),
  constraint closed_has_timestamp check (
    (status = 'OPEN' and closed_at is null)
    or (status <> 'OPEN' and closed_at is not null)
  )
);

create index tasks_user_week_idx   on tasks (user_id, week_start desc);
create index tasks_goal_idx        on tasks (goal_id) where goal_id is not null;
create index tasks_open_idx        on tasks (user_id, status) where status = 'OPEN';
