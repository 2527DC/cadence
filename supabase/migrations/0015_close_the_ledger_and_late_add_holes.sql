-- 0015_close_the_ledger_and_late_add_holes.sql
--
-- Two real holes in P01, found by an adversarial review on 2026-09-04 and both
-- reproducible. Neither was caught by supabase/tests/01_destructive.sql, and the reason
-- is worth writing down: those tests checked the operations the design talks about
-- (UPDATE and DELETE on the ledger, direct status writes) and never checked the one
-- nobody thinks about — a plain INSERT.
--
-- ---------------------------------------------------------------------------
-- HOLE 1: the append-only ledger could be appended to directly.
--
-- close_task() is meant to be the only door, and 0006 guards `tasks.status` behind a
-- transaction-local flag. But `task_status_events` itself had no such guard. It has an
-- INSERT policy and an INSERT grant — it must, because close_task() is SECURITY INVOKER
-- and inserts as the caller — so any client could write straight into the ledger:
--
--     insert into task_status_events (user_id, task_id, from_status, to_status, note)
--     values (auth.uid(), '<my task>', 'OPEN', 'C', 'a note long enough to pass');
--
-- That fabricates history: an event that never happened, with a note nobody wrote,
-- attached to a task whose status never moved. The analytics read the ledger. The whole
-- claim of this app is that they can be trusted.
--
-- Fixed by guarding the INSERT with the same flag that guards the status flip. The flag
-- is transaction-local and set only inside close_task(), and nothing reachable through
-- PostgREST can call set_config() on its own.
--
-- ---------------------------------------------------------------------------
-- HOLE 2: late_add was client-supplied after all.
--
-- 0006 §4.4 is titled "late_add is computed, not client-supplied" and then computes it
-- from `coalesce(new.finalized_at, now())` — a value the client sends. Backdating
-- finalized_at to the Monday made a Sunday commitment look punctual.
--
-- Worse, neither `finalized_at` nor `late_add` was in the frozen set in §4.2, so even
-- after finalizing, a plain `update tasks set late_add = false` was accepted. The flag
-- was never protected at all.
--
-- Fixed by computing both from now(), ignoring whatever arrives, and freezing both
-- once the task is finalized.
--
-- The cost: seed data can no longer backdate a finalize. seed.sql now does that step
-- with `session_replication_role = replica`, which is the same mechanism a pg_restore
-- uses and is already documented in supabase/README.md. It requires superuser, so it is
-- not a door the app can open.

-- ---------------------------------------------------------------------------
-- 1. The ledger is written by close_task() or not at all
-- ---------------------------------------------------------------------------

create or replace function guard_status_event_insert()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('cadence.closing_task', true), '') <> 'on' then
    raise exception
      'task_status_events is append-only through close_task(). Direct inserts are not allowed.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger trg_guard_status_event_insert
  before insert on task_status_events
  for each row execute function guard_status_event_insert();

-- UPDATE and DELETE need no trigger here: there is no policy and no grant for either,
-- so they are refused two layers earlier. INSERT is the one that had to be granted.

-- ---------------------------------------------------------------------------
-- 2. close_task() sets the flag before it writes the event
-- ---------------------------------------------------------------------------
-- Only the ordering changes: the flag now goes up before the INSERT rather than
-- between the INSERT and the UPDATE. Every validation rule is unchanged.

create or replace function close_task(
  p_task_id       uuid,
  p_to_status     task_status,
  p_note          text default null,
  p_voice_note_id uuid default null,
  p_nc_reason     nc_reason default null
)
returns tasks
language plpgsql
security invoker
as $$
declare
  v_task tasks;
  v_from task_status;
begin
  if p_to_status = 'OPEN' then
    raise exception 'close_task cannot set status back to OPEN.'
      using errcode = 'check_violation';
  end if;

  select * into v_task from tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task % not found.', p_task_id
      using errcode = 'no_data_found';
  end if;

  if not v_task.is_finalized then
    raise exception 'Task % is still a draft. Finalize it before closing it.', p_task_id
      using errcode = 'check_violation';
  end if;

  v_from := v_task.status;
  if v_from = p_to_status then
    raise exception 'Task % is already %.', p_task_id, p_to_status
      using errcode = 'check_violation';
  end if;

  if p_voice_note_id is null
     and (p_note is null or length(trim(p_note)) < 15) then
    raise exception
      'A note of at least 15 characters, or a voice note, is required to close a task.'
      using errcode = 'check_violation';
  end if;

  if p_voice_note_id is null
     and lower(trim(p_note)) ~ '^(ok|done|na|n/a|nil|asdf|test|\.+|-+)$' then
    raise exception 'Write a real note. That one says nothing.'
      using errcode = 'check_violation';
  end if;

  if p_voice_note_id is not null
     and not exists (
       select 1 from voice_notes
        where id = p_voice_note_id and user_id = v_task.user_id
     ) then
    raise exception 'Voice note % does not belong to you.', p_voice_note_id
      using errcode = 'check_violation';
  end if;

  if p_to_status = 'NC' and p_nc_reason is null then
    raise exception 'NC requires a reason category.'
      using errcode = 'check_violation';
  end if;

  -- The flag now covers BOTH writes. Every validation above has already passed, so the
  -- window in which the ledger is writable is exactly the window in which the write is
  -- known to be legitimate.
  perform set_config('cadence.closing_task', 'on', true);   -- true = transaction-local

  insert into task_status_events
    (user_id, task_id, from_status, to_status, note, voice_note_id, nc_reason)
  values
    (v_task.user_id, p_task_id, v_from, p_to_status, p_note, p_voice_note_id, p_nc_reason);

  update tasks
     set status    = p_to_status,
         closed_at = now(),
         nc_reason = case when p_to_status = 'NC' then p_nc_reason else null end
   where id = p_task_id
  returning * into v_task;

  -- Down again, so the rest of the transaction cannot ride on it.
  perform set_config('cadence.closing_task', 'off', true);

  return v_task;
end $$;

revoke execute on function close_task(uuid, task_status, text, uuid, nc_reason) from public;
grant  execute on function close_task(uuid, task_status, text, uuid, nc_reason)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. late_add and finalized_at are the database's to decide
-- ---------------------------------------------------------------------------

create or replace function mark_late_add()
returns trigger language plpgsql as $$
declare
  v_was_finalized boolean := case when tg_op = 'INSERT' then false else old.is_finalized end;
begin
  if new.is_finalized and not v_was_finalized then
    -- now(), not coalesce(new.finalized_at, now()). A client that sends its own
    -- finalized_at is either wrong or backdating, and both are answered the same way.
    new.finalized_at := now();
    -- Wednesday is isodow 3, in Asia/Kolkata (OQ-1). Committing on Thu/Fri/Sat/Sun is
    -- a late add, and saying otherwise is the lie this guards against.
    new.late_add := extract(isodow from (new.finalized_at at time zone 'Asia/Kolkata')) > 3;
  end if;
  return new;
end $$;

-- Freeze both once the task is finalized. Without this the flag could simply be
-- overwritten a second after it was set — §4.2 froze the identity but not the evidence.

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

    if new.finalized_at is distinct from old.finalized_at
    or new.late_add     is distinct from old.late_add then
      raise exception
        'Task % is finalized: when it was committed, and whether that was late, are not editable.',
        old.id
        using errcode = 'restrict_violation';
    end if;

    if new.is_finalized = false then
      raise exception 'A finalized task cannot be reverted to draft.'
        using errcode = 'restrict_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
