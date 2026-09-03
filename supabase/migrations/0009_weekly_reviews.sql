-- 0009_weekly_reviews.sql
-- Source of truth: doc/03-data-model-supabase.md §3.7
--
-- `stats` is a snapshot of the numbers at review time, so a past review never shifts
-- under you when the analytics formulas change.

create table weekly_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  week_start    date not null,
  summary       text,
  voice_note_id uuid references voice_notes(id) on delete restrict,
  stats         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  unique (user_id, week_start),
  constraint week_start_is_monday check (extract(isodow from week_start) = 1)
);
