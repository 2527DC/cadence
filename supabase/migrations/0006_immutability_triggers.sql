-- 0006_immutability_triggers.sql
-- Source of truth: doc/03-data-model-supabase.md §4.1 - §4.4
--
-- This is where the promise of the app actually lives. RLS (0010) can be edited in a
-- panic; these triggers are the second lock on the same door.
--
-- Firing order note: Postgres fires BEFORE ROW triggers in alphabetical order by
-- trigger name. That gives guard -> lock -> mark, which is the order we want:
-- the two rejections run before the row is mutated by mark_late_add.
--
-- DEVIATION from the doc, applied to §4.3 and §4.4: both triggers are extended to
-- fire on INSERT as well as UPDATE. The doc has them UPDATE-only, which leaves the
-- mandatory-note rule bypassable in one statement:
--
--     insert into tasks (..., is_finalized, finalized_at, status, closed_at)
--     values (..., true, now(), 'C', now());
--
-- That produces a finalized, completed task with no row in task_status_events and no
-- note anywhere. Every constraint in 0004 permits it. Closing the hole means a
-- pg_restore of a data dump must run with `set session_replication_role = replica`
-- (the standard approach for any trigger-enforced invariant); see supabase/README.md.

-- §4.1 - A finalized task can never be deleted -------------------------------

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

-- §4.2 - A finalized task's identity is immutable ----------------------------

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

-- §4.3 - Status can only change through the RPC ------------------------------
-- Direct `update tasks set status = 'C'` must fail, otherwise the mandatory note is
-- bypassable. close_task() sets a transaction-local flag; nothing else does.

create or replace function guard_status_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- a task is always born OPEN; there is no legitimate way to insert one already closed
    if new.status <> 'OPEN'
       and coalesce(current_setting('cadence.closing_task', true), '') <> 'on' then
      raise exception
        'A task must be created with status OPEN. Close it with close_task() instead.'
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('cadence.closing_task', true), '') <> 'on' then
    raise exception
      'Status must be changed via close_task(). Direct updates are not allowed.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger trg_guard_status_change
  before insert or update on tasks
  for each row execute function guard_status_change();

-- §4.4 - late_add is computed, not client-supplied ---------------------------
-- Wednesday = isodow 3; finalizing on Thu/Fri/Sat/Sun is a late add.
-- The timezone is OQ-1's locked Asia/Kolkata. It is hardcoded rather than read from
-- profiles.timezone because this trigger runs per row on a hot path, and OQ-1 fixed
-- the timezone for the single user this app has. If profiles.timezone ever varies,
-- this is the line that has to change.

create or replace function mark_late_add()
returns trigger language plpgsql as $$
declare
  v_was_finalized boolean := case when tg_op = 'INSERT' then false else old.is_finalized end;
begin
  if new.is_finalized and not v_was_finalized then
    new.finalized_at := coalesce(new.finalized_at, now());
    new.late_add := extract(isodow from (new.finalized_at at time zone 'Asia/Kolkata')) > 3;
  end if;
  return new;
end $$;

create trigger trg_mark_late_add
  before insert or update on tasks
  for each row execute function mark_late_add();
