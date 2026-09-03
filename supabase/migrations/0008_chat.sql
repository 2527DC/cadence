-- 0008_chat.sql
-- Source of truth: doc/03-data-model-supabase.md §3.6

create table threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  goal_id    uuid references goals(id) on delete restrict,
  title      text not null,
  kind       text not null default 'general'
             check (kind in ('general', 'goal', 'daily_log')),
  created_at timestamptz not null default now(),
  unique (user_id, goal_id)
);

create table messages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  thread_id      uuid not null references threads(id) on delete restrict,
  kind           message_kind not null,
  body           text,
  voice_note_id  uuid references voice_notes(id) on delete restrict,
  linked_task_id uuid references tasks(id) on delete restrict,
  linked_goal_id uuid references goals(id) on delete restrict,
  created_at     timestamptz not null default now(),

  constraint body_matches_kind check (
    (kind = 'text'  and body is not null and length(trim(body)) > 0 and voice_note_id is null)
    or (kind = 'voice' and voice_note_id is not null)
  )
);

create index messages_thread_idx on messages (thread_id, created_at desc);

alter table messages add column body_tsv tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;
create index messages_fts_idx on messages using gin (body_tsv);
