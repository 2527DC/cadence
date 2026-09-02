# 03 — Data Model (Supabase / Postgres)

App: **Cadence**
Status: **draft schema — review before writing migration 0001**

> **Design principle:** the rules in [01-product-requirements.md](01-product-requirements.md)
> section 4 are enforced *here*, in the database. The app is one client among many possible
> ones (a future web app, a script, a curl call). If a rule only exists in React, it does
> not exist.

---

## 1. Entity overview

```
auth.users
    └── profiles (1:1)
          ├── goals ─────────┐
          │                  │
          ├── tasks ─────────┘ (goal_id nullable)
          │     └── task_status_events   [APPEND-ONLY]
          │
          ├── threads
          │     └── messages
          │           └── voice_notes (nullable)
          │
          ├── voice_notes
          └── weekly_reviews
```

---

## 2. Enums

```sql
create type task_status  as enum ('OPEN', 'N', 'C', 'NC');
create type goal_state   as enum ('active', 'paused', 'archived');
create type message_kind as enum ('text', 'voice');
create type nc_reason    as enum ('illness', 'blocked_by_others', 'cancelled_externally',
                                  'plan_changed', 'other');
create type transcript_status as enum ('pending', 'on_device', 'cloud', 'failed');
```

---

## 3. Tables

### 3.1 `profiles`

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  timezone      text not null default 'Asia/Kolkata',
  week_start_day smallint not null default 1,        -- 1 = Monday
  streak_threshold numeric not null default 0.70,    -- completion rate needed for a "kept" week
  created_at    timestamptz not null default now()
);
```

`streak_threshold` is what "a good week" means to you. 0.70 is a starting guess — see OQ-2.

### 3.2 `goals`

```sql
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
```

**Goals are never hard-deleted.** There is no DELETE policy (section 5). Set
`state = 'archived'` instead, which keeps every historical task and its analytics intact.

### 3.3 `tasks`

```sql
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  goal_id       uuid references goals(id) on delete restrict,   -- restrict: goals can't vanish
  title         text not null check (length(trim(title)) between 3 and 200),
  detail        text,
  week_start    date not null,
  planned_for   date,
  weight        smallint not null default 1 check (weight between 1 and 5),

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
```

### 3.4 `task_status_events` — the append-only ledger

```sql
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
```

**This table has no UPDATE and no DELETE policy.** Insert only. That is rule R4.

### 3.5 `voice_notes`

```sql
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
create index voice_notes_fts_idx on voice_notes using gin (transcript_tsv);
```

Recordings are **never deleted** while referenced — the `on delete restrict` on both
`task_status_events.voice_note_id` and `messages.voice_note_id` guarantees it.

### 3.6 `threads` and `messages` — the chat log

```sql
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
```

### 3.7 `weekly_reviews`

```sql
create table weekly_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  week_start    date not null,
  summary       text,
  voice_note_id uuid references voice_notes(id) on delete restrict,
  -- snapshot of the numbers at review time, so history never shifts under you
  stats         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  unique (user_id, week_start),
  constraint week_start_is_monday check (extract(isodow from week_start) = 1)
);
```

---

## 4. Triggers — where immutability actually lives

### 4.1 A finalized task can never be deleted

```sql
create or replace function prevent_finalized_task_delete()
returns trigger language plpgsql as $$
begin
  if old.is_finalized then
    raise exception
      'Task % is finalized and can never be deleted. Close it with a status instead.',
      old.id
      using errcode = 'restrict_violation';
  end if;
  return old;
end $$;

create trigger trg_prevent_finalized_task_delete
  before delete on tasks
  for each row execute function prevent_finalized_task_delete();
```

### 4.2 A finalized task's identity is immutable

```sql
create or replace function lock_finalized_task_fields()
returns trigger language plpgsql as $$
begin
  if old.is_finalized then
    if new.title      is distinct from old.title
    or new.goal_id    is distinct from old.goal_id
    or new.week_start is distinct from old.week_start
    or new.weight     is distinct from old.weight then
      raise exception
        'Task % is finalized: title, goal, week and weight cannot change. Only status can.',
        old.id
        using errcode = 'restrict_violation';
    end if;
    -- un-finalizing is not a thing
    if new.is_finalized = false then
      raise exception 'A finalized task cannot be reverted to draft.'
        using errcode = 'restrict_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_lock_finalized_task_fields
  before update on tasks
  for each row execute function lock_finalized_task_fields();
```

### 4.3 Status can only change through the RPC

Direct `update tasks set status = 'C'` must fail — otherwise the mandatory note is
bypassable. A session-local flag set only by the RPC:

```sql
create or replace function guard_status_change()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('cadence.closing_task', true), '') <> 'on' then
    raise exception
      'Status must be changed via close_task(). Direct updates are not allowed.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger trg_guard_status_change
  before update on tasks
  for each row execute function guard_status_change();
```

### 4.4 `late_add` is computed, not client-supplied

```sql
create or replace function mark_late_add()
returns trigger language plpgsql as $$
begin
  if new.is_finalized and not coalesce(old.is_finalized, false) then
    new.finalized_at := coalesce(new.finalized_at, now());
    -- Wednesday = isodow 3; finalizing on Thu/Fri/Sat/Sun is a late add
    new.late_add := extract(isodow from (new.finalized_at at time zone 'Asia/Kolkata')) > 3;
  end if;
  return new;
end $$;

create trigger trg_mark_late_add
  before update on tasks
  for each row execute function mark_late_add();
```

---

## 5. The `close_task` RPC — the only door

```sql
create or replace function close_task(
  p_task_id       uuid,
  p_to_status     task_status,
  p_note          text default null,
  p_voice_note_id uuid default null,
  p_nc_reason     nc_reason default null
)
returns tasks
language plpgsql
security invoker            -- RLS still applies; the user can only touch their own rows
as $$
declare
  v_task tasks;
  v_from task_status;
begin
  if p_to_status = 'OPEN' then
    raise exception 'close_task cannot set status back to OPEN.';
  end if;

  select * into v_task from tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task % not found.', p_task_id;
  end if;

  if not v_task.is_finalized then
    raise exception 'Task % is still a draft. Finalize it before closing it.', p_task_id;
  end if;

  v_from := v_task.status;
  if v_from = p_to_status then
    raise exception 'Task % is already %.', p_task_id, p_to_status;
  end if;

  -- R3: note or voice note, always
  if p_voice_note_id is null
     and (p_note is null or length(trim(p_note)) < 15) then
    raise exception
      'A note of at least 15 characters, or a voice note, is required to close a task.'
      using errcode = 'check_violation';
  end if;

  -- reject low-effort placeholder notes
  if p_voice_note_id is null
     and lower(trim(p_note)) ~ '^(ok|done|na|n/a|nil|asdf|test|\.+|-+)$' then
    raise exception 'Write a real note. That one says nothing.'
      using errcode = 'check_violation';
  end if;

  if p_to_status = 'NC' and p_nc_reason is null then
    raise exception 'NC requires a reason category.'
      using errcode = 'check_violation';
  end if;

  -- append the immutable event first
  insert into task_status_events
    (user_id, task_id, from_status, to_status, note, voice_note_id, nc_reason)
  values
    (v_task.user_id, p_task_id, v_from, p_to_status, p_note, p_voice_note_id, p_nc_reason);

  -- then flip the denormalized status, with the guard flag on
  perform set_config('cadence.closing_task', 'on', true);   -- true = transaction-local
  update tasks
     set status    = p_to_status,
         closed_at = now(),
         nc_reason = case when p_to_status = 'NC' then p_nc_reason else null end
   where id = p_task_id
  returning * into v_task;

  return v_task;
end $$;
```

**Why one RPC:** the event row and the status flip are one transaction. There is no window
where a task is closed without a note in the ledger.

---

## 6. Row Level Security

Enable on every table:

```sql
alter table profiles            enable row level security;
alter table goals               enable row level security;
alter table tasks               enable row level security;
alter table task_status_events  enable row level security;
alter table voice_notes         enable row level security;
alter table threads             enable row level security;
alter table messages            enable row level security;
alter table weekly_reviews      enable row level security;
```

Standard owner policies:

```sql
-- pattern applied to goals, voice_notes, threads, messages, weekly_reviews
create policy own_select on goals for select using (auth.uid() = user_id);
create policy own_insert on goals for insert with check (auth.uid() = user_id);
create policy own_update on goals for update using (auth.uid() = user_id);
-- NOTE: no delete policy on goals. Archiving only.
```

The two tables that differ:

```sql
-- tasks: delete is permitted ONLY for drafts
create policy tasks_select on tasks for select using (auth.uid() = user_id);
create policy tasks_insert on tasks for insert with check (auth.uid() = user_id);
create policy tasks_update on tasks for update using (auth.uid() = user_id);
create policy tasks_delete on tasks for delete
  using (auth.uid() = user_id and is_finalized = false);

-- task_status_events: insert and select only. Ever.
create policy tse_select on task_status_events for select using (auth.uid() = user_id);
create policy tse_insert on task_status_events for insert with check (auth.uid() = user_id);
-- no update policy. no delete policy. this is deliberate.
```

**Two independent layers stop deletion of a finalized task:** the RLS policy denies it, and
the trigger raises even if the policy were ever loosened. Neither alone is enough — RLS can
be edited in a panic, and triggers can be dropped. Both being present means a mistake needs
two mistakes.

### Storage policies

```sql
-- bucket: voice-notes, private
create policy "own voice notes read" on storage.objects for select
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own voice notes write" on storage.objects for insert
  with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);
-- no delete policy: recordings are permanent
```

---

## 7. Analytics views

Formulas live in [05-analytics-spec.md](05-analytics-spec.md); these are the SQL surfaces.

```sql
create view v_week_rollup as
select
  user_id,
  week_start,
  count(*)                                     as total,
  count(*) filter (where status = 'C')         as completed,
  count(*) filter (where status = 'N')         as missed,
  count(*) filter (where status = 'NC')        as not_counted,
  count(*) filter (where status = 'OPEN')      as still_open,
  count(*) filter (where late_add)             as late_adds,
  -- NC excluded from the denominator; that is the whole point of NC
  nullif(count(*) filter (where status in ('C','N')), 0)      as counted_total,
  round(
    count(*) filter (where status = 'C')::numeric
    / nullif(count(*) filter (where status in ('C','N')), 0), 4
  )                                            as completion_rate,
  round(
    count(*) filter (where status = 'NC')::numeric / nullif(count(*), 0), 4
  )                                            as nc_rate
from tasks
where is_finalized
group by user_id, week_start;

create view v_goal_progress as
select
  g.id as goal_id, g.user_id, g.title, g.target_per_week, g.state,
  t.week_start,
  count(t.*) filter (where t.status = 'C')  as completed,
  g.target_per_week                          as target,
  round(
    least(count(t.*) filter (where t.status = 'C')::numeric / g.target_per_week, 1), 4
  )                                          as attainment
from goals g
left join tasks t on t.goal_id = g.id and t.is_finalized
group by g.id, g.user_id, g.title, g.target_per_week, g.state, t.week_start;
```

---

## 8. Migration order

| # | File | Contents |
|---|---|---|
| 0001 | `init_enums_and_profiles.sql` | Enums, `profiles`, trigger to create a profile on signup |
| 0002 | `goals.sql` | `goals` + indexes |
| 0003 | `voice_notes.sql` | `voice_notes` + FTS |
| 0004 | `tasks.sql` | `tasks` + constraints + indexes |
| 0005 | `task_status_events.sql` | The append-only ledger |
| 0006 | `immutability_triggers.sql` | Sections 4.1 – 4.4 |
| 0007 | `close_task_rpc.sql` | Section 5 |
| 0008 | `chat.sql` | `threads`, `messages`, FTS |
| 0009 | `weekly_reviews.sql` | |
| 0010 | `rls_policies.sql` | Section 6 |
| 0011 | `analytics_views.sql` | Section 7 |
| 0012 | `storage_bucket.sql` | `voice-notes` bucket + policies |

Every one is a file in `supabase/migrations/`. Never a dashboard click.

---

Related: [[01-product-requirements]], [[02-tech-stack]], [[04-architecture]], [[05-analytics-spec]]
