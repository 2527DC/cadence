-- tests/01_destructive.sql
--
-- The point of P01. Every assertion in this file tries to falsify the record and
-- must be stopped. A test that "passes" by throwing the wrong error is worthless,
-- so must_fail() can be given a substring the error message has to contain.
--
-- One subtlety drives the whole file. There are two different ways the database
-- says no, and they look nothing like each other:
--
--   * a TRIGGER or a missing GRANT raises an exception
--   * RLS does not raise. It filters the rows away, and the statement reports
--     "0 rows affected" with no error at all
--
-- So `delete from tasks where is_finalized` as the app user is not an error - it is
-- a silent no-op. Asserting must_fail() on it would fail for the wrong reason and
-- teach us nothing. Each layer is therefore checked with the assertion that fits it,
-- and the finalized-delete case is checked twice: once through RLS as the app user,
-- once through the trigger as the owner with RLS out of the way.
--
-- Everything runs inside one transaction that is rolled back at the end, so the
-- tests can be run repeatedly against a seeded database without disturbing it.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Assertion helpers. Created as the owner, before dropping to `authenticated`.
-- pg_temp is session-local, so these vanish when psql disconnects.
-- ---------------------------------------------------------------------------

create function pg_temp.must_fail(p_label text, p_sql text, p_expect text default null)
returns void language plpgsql as $fn$
declare
  v_err text;
begin
  begin
    execute p_sql;
  exception when others then
    v_err := sqlerrm;
    if p_expect is not null and position(lower(p_expect) in lower(v_err)) = 0 then
      raise exception 'FAIL  %: rejected, but for the wrong reason. Expected the message to contain "%", got "%"',
        p_label, p_expect, v_err;
    end if;
    raise notice 'PASS  % -> %', p_label, v_err;
    return;
  end;
  raise exception 'FAIL  %: the statement SUCCEEDED and must not have.', p_label;
end $fn$;

create function pg_temp.must_touch_nothing(p_label text, p_sql text)
returns void language plpgsql as $fn$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL  %: affected % row(s). RLS should have filtered every one.',
      p_label, v_rows;
  end if;
  raise notice 'PASS  % -> 0 rows (RLS filtered them)', p_label;
end $fn$;

-- ---------------------------------------------------------------------------
-- Layer 1 and 2, as the app user: RLS plus triggers
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_task      uuid;
  v_draft     uuid;
  v_event     uuid;
  v_goal      uuid;
  v_other_vn  uuid;
begin
  select id into strict v_task
    from tasks where is_finalized and status = 'C' order by created_at limit 1;
  select id into strict v_goal from goals order by created_at limit 1;
  select id into strict v_event from task_status_events order by created_at limit 1;

  -- A finalized task cannot be deleted -------------------------------------
  -- RLS first: the delete policy is `is_finalized = false`, so a finalized row is
  -- simply not visible to the statement. No error, no deletion.
  perform pg_temp.must_touch_nothing(
    'delete a finalized task (RLS layer)',
    'delete from tasks where id = ''' || v_task || '''');

  -- A finalized task's identity is frozen ----------------------------------
  perform pg_temp.must_fail(
    'rename a finalized task',
    'update tasks set title = ''x renamed'' where id = ''' || v_task || '''',
    'cannot change');

  perform pg_temp.must_fail(
    'move a finalized task to another week',
    'update tasks set week_start = week_start - 7 where id = ''' || v_task || '''',
    'cannot change');

  perform pg_temp.must_fail(
    'un-finalize a task',
    'update tasks set is_finalized = false where id = ''' || v_task || '''',
    'cannot be reverted');

  -- Status only moves through close_task() ----------------------------------
  -- closed_at is set too, so the closed_has_timestamp constraint cannot be what
  -- fires. The only thing left to reject this is the guard trigger.
  perform pg_temp.must_fail(
    'set status directly, bypassing the RPC',
    'update tasks set status = ''N'', closed_at = now() where id = ''' || v_task || '''',
    'close_task');

  -- ... and a task cannot be born already closed, either. Without this, the
  -- mandatory note is bypassable in a single INSERT.
  perform pg_temp.must_fail(
    'insert a task that is already closed',
    'insert into tasks (user_id, title, week_start, is_finalized, finalized_at, status, closed_at)
     values (''11111111-1111-1111-1111-111111111111'', ''Born complete'',
             date_trunc(''week'', current_date)::date, true, now(), ''C'', now())',
    'must be created with status OPEN');

  -- close_task() enforces the note ------------------------------------------
  perform pg_temp.must_fail(
    'close with a two-character note',
    'select close_task(''' || v_task || '''::uuid, ''N''::task_status, ''ok'')',
    'at least 15 characters');

  perform pg_temp.must_fail(
    'close with no note at all',
    'select close_task(''' || v_task || '''::uuid, ''N''::task_status, null)',
    'at least 15 characters');

  -- Long enough to clear the length check, still says nothing. This is the only
  -- shape of placeholder the regex can actually catch - see the note at the end.
  perform pg_temp.must_fail(
    'close with a note that is 20 dots',
    'select close_task(''' || v_task || '''::uuid, ''N''::task_status, ''....................'')',
    'says nothing');

  perform pg_temp.must_fail(
    'close NC without a reason category',
    'select close_task(''' || v_task || '''::uuid, ''NC''::task_status,
       ''Cancelled by the other side, nothing I could do about it.'')',
    'requires a reason');

  -- The seed finalizes everything it creates, so there is no draft lying around to
  -- borrow. Make one here rather than depending on seed data that does not exist.
  insert into tasks (user_id, title, week_start)
  values ('11111111-1111-1111-1111-111111111111', 'Still a draft on purpose',
          date_trunc('week', current_date)::date)
  returning id into v_draft;

  perform pg_temp.must_fail(
    'close a task that is still a draft',
    'select close_task(''' || v_draft || '''::uuid, ''C''::task_status,
       ''This one was never finalized in the first place.'')',
    'still a draft');

  -- The ledger is append-only ------------------------------------------------
  -- No UPDATE grant and no UPDATE policy: the privilege check fires first.
  perform pg_temp.must_fail(
    'edit a status event',
    'update task_status_events set note = ''rewritten history'' where id = ''' || v_event || '''',
    'permission denied');

  perform pg_temp.must_fail(
    'delete a status event',
    'delete from task_status_events where id = ''' || v_event || '''',
    'permission denied');

  -- Goals are archived, never deleted ---------------------------------------
  perform pg_temp.must_fail(
    'delete a goal',
    'delete from goals where id = ''' || v_goal || '''',
    'permission denied');

  -- Voice notes are permanent -----------------------------------------------
  perform pg_temp.must_fail(
    'delete a voice note',
    'delete from voice_notes',
    'permission denied');

  -- A draft, by contrast, is genuinely deletable ----------------------------
  insert into tasks (user_id, title, week_start)
  values ('11111111-1111-1111-1111-111111111111', 'A throwaway draft',
          date_trunc('week', current_date)::date)
  returning id into v_draft;

  delete from tasks where id = v_draft;
  if exists (select 1 from tasks where id = v_draft) then
    raise exception 'FAIL  a draft task could not be deleted, and drafts must be deletable';
  end if;
  raise notice 'PASS  delete a DRAFT task -> allowed, as designed';
end $$;

-- ---------------------------------------------------------------------------
-- Layer 2 on its own: the trigger, with RLS out of the picture
-- ---------------------------------------------------------------------------
-- The check above proved RLS stops the delete. This one proves the trigger stops it
-- too, by running as the table owner, who bypasses RLS entirely. That is the "two
-- mistakes" property from doc/03 §6: loosening the policy alone is not enough to
-- lose a finalized task.

reset role;

do $$
begin
  perform pg_temp.must_fail(
    'delete a finalized task as the OWNER (trigger layer, RLS bypassed)',
    'delete from tasks where is_finalized and status = ''C''',
    'can never be deleted');
end $$;

rollback;
