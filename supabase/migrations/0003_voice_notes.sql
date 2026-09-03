-- 0003_voice_notes.sql
-- Source of truth: doc/03-data-model-supabase.md §3.5
--
-- Comes before tasks (0004) because task_status_events (0005) references it.
--
-- Recordings are never deleted while referenced: the `on delete restrict` on both
-- task_status_events.voice_note_id and messages.voice_note_id guarantees it.

create table voice_notes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  storage_path      text not null unique,           -- voice-notes/{user_id}/{uuid}.m4a
  duration_ms       integer not null check (duration_ms >= 0),
  size_bytes        integer,
  mime_type         text not null default 'audio/m4a',
  waveform          smallint[],                     -- ~60 sampled amplitude points
  transcript        text,
  transcript_status transcript_status not null default 'pending',
  transcript_error  text,
  recorded_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- full-text search over transcripts
alter table voice_notes add column transcript_tsv tsvector
  generated always as (to_tsvector('english', coalesce(transcript, ''))) stored;
create index voice_notes_fts_idx  on voice_notes using gin (transcript_tsv);
create index voice_notes_user_idx on voice_notes (user_id, recorded_at desc);
