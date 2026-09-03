-- 0005_task_status_events.sql
-- The append-only ledger. Source of truth: doc/03-data-model-supabase.md §3.4
--
-- This table has no UPDATE policy and no DELETE policy in 0010, and no UPDATE or
-- DELETE grant. That is rule R4, and it is the reason the analytics can be trusted.

create table task_status_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  task_id        uuid not null references tasks(id) on delete restrict,
  from_status    task_status not null,
  to_status      task_status not null,
  note           text,
  voice_note_id  uuid references voice_notes(id) on delete restrict,
  nc_reason      nc_reason,
  created_at     timestamptz not null default now(),

  constraint status_actually_changed check (from_status <> to_status),
  -- R3: a note OR a voice note is mandatory
  constraint note_required check (
    voice_note_id is not null
    or (note is not null and length(trim(note)) >= 15)
  )
);

create index tse_task_idx on task_status_events (task_id, created_at);
create index tse_user_idx on task_status_events (user_id, created_at desc);
