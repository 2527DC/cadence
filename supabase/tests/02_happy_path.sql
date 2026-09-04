-- tests/02_happy_path.sql
--
-- The rules are only worth having if the legitimate path still works. This file
-- walks a task through its whole life and checks the numbers that come out.
--
-- Rolled back at the end, so it can run against a seeded database repeatedly.

\set ON_ERROR_STOP on

begin;

create function pg_temp.must_equal(p_label text, p_actual anyelement, p_expected anyelement)
returns void language plpgsql as $fn$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL  %: expected %, got %', p_label,
      coalesce(p_expected::text, 'NULL'), coalesce(p_actual::text, 'NULL');
  end if;
  raise notice 'PASS  % = %', p_label, coalesce(p_actual::text, 'NULL');
end $fn$;

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- One task, all the way through
-- ---------------------------------------------------------------------------

do $$
declare
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_week  date := date_trunc('week', current_date)::date + 70;   -- a clean, empty week
  v_task  uuid;
  v_row   tasks;
  v_n     int;
begin
  insert into tasks (user_id, title, week_start, planned_for)
  values (v_user, 'Walk the whole loop of this test', v_week, v_week + 2)
  returning id into v_task;

  perform pg_temp.must_equal('a new task starts OPEN',
    (select status from tasks where id = v_task), 'OPEN'::task_status);
  perform pg_temp.must_equal('a new task starts as a draft',
    (select is_finalized from tasks where id = v_task), false);

  -- Finalizing: both finalized_at and late_add are the database's to decide.
  --
  -- This deliberately supplies a lie in each field — a finalized_at three weeks in the
  -- past, and late_add = false — and expects both to be discarded. Before 0015 the
  -- backdated timestamp was accepted and late_add was computed from it, which meant a
  -- Sunday commitment could be made to look punctual.
  update tasks
     set is_finalized = true,
         finalized_at = (v_week - 21)::timestamptz + time '10:00',
         late_add     = false
   where id = v_task;

  perform pg_temp.must_equal('a client-supplied finalized_at is discarded',
    (select finalized_at::date from tasks where id = v_task),
    (now() at time zone 'Asia/Kolkata')::date);

  perform pg_temp.must_equal('late_add is computed from the real commit time',
    (select late_add from tasks where id = v_task),
    extract(isodow from (now() at time zone 'Asia/Kolkata')) > 3);

  -- Close it -----------------------------------------------------------------
  select * into v_row from close_task(v_task, 'C',
    'Finished it on the Thursday morning before anything else came up.');

  perform pg_temp.must_equal('close_task returns the closed row',
    v_row.status, 'C'::task_status);
  perform pg_temp.must_equal('closed_at is stamped',
    (select closed_at is not null from tasks where id = v_task), true);

  select count(*) into v_n from task_status_events where task_id = v_task;
  perform pg_temp.must_equal('closing writes exactly one ledger row', v_n, 1);

  perform pg_temp.must_equal('the ledger records where it came from',
    (select from_status from task_status_events where task_id = v_task), 'OPEN'::task_status);

  -- Reopen it, honestly ------------------------------------------------------
  perform close_task(v_task, 'N',
    'Looked at it again the next day and it was not actually finished.');

  select count(*) into v_n from task_status_events where task_id = v_task;
  perform pg_temp.must_equal('correcting a close appends, never overwrites', v_n, 2);

  perform pg_temp.must_equal('the task now reads N',
    (select status from tasks where id = v_task), 'N'::task_status);

  -- Both events survive, in order. This is the whole promise of the app.
  perform pg_temp.must_equal('the ledger tells the full story',
    (select string_agg(from_status || '->' || to_status, ', ' order by created_at)
       from task_status_events where task_id = v_task),
    'OPEN->C, C->N');
end $$;

-- close_task refuses to repeat itself ---------------------------------------

do $$
declare
  v_task uuid;
begin
  select id into v_task from tasks
   where week_start = date_trunc('week', current_date)::date + 70 limit 1;
  begin
    perform close_task(v_task, 'N', 'Trying to close it as N a second time over.');
    raise exception 'FAIL  closing a task to its current status was allowed';
  exception when check_violation then
    raise notice 'PASS  closing to the status it already has -> %', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- v_week_rollup, with NC present
-- ---------------------------------------------------------------------------
-- The one formula in the app that would be easy to get quietly wrong: NC has to be
-- out of the denominator, or "not counted" does not mean anything.
--
-- This week is built to be unambiguous: 3 completed, 1 missed, 1 not counted.
--   completion_rate = 3 / (3+1)   = 0.75    <- NC excluded
--   if NC leaked in  = 3 / 5      = 0.60    <- what a wrong formula would say
--   nc_rate         = 1 / 5       = 0.20    <- NC included, this one counts everything

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_week date := date_trunc('week', current_date)::date + 140;
  v_task uuid;
  v_i    int;
  v_roll v_week_rollup;
begin
  for v_i in 1..5 loop
    insert into tasks (user_id, title, week_start)
    values (v_user, 'Rollup fixture task number ' || v_i, v_week)
    returning id into v_task;

    update tasks set is_finalized = true, finalized_at = v_week::timestamptz where id = v_task;

    if v_i <= 3 then
      perform close_task(v_task, 'C', 'Completed this one without any trouble at all.');
    elsif v_i = 4 then
      perform close_task(v_task, 'N', 'Did not get to this one before the week ran out.');
    else
      perform close_task(v_task, 'NC', 'Client cancelled the whole thing on the Tuesday.',
                         null, 'cancelled_externally');
    end if;
  end loop;

  select * into v_roll from v_week_rollup where user_id = v_user and week_start = v_week;

  perform pg_temp.must_equal('rollup: total',           v_roll.total,         5::bigint);
  perform pg_temp.must_equal('rollup: completed',       v_roll.completed,     3::bigint);
  perform pg_temp.must_equal('rollup: missed',          v_roll.missed,        1::bigint);
  perform pg_temp.must_equal('rollup: not_counted',     v_roll.not_counted,   1::bigint);
  perform pg_temp.must_equal('rollup: counted_total excludes NC',
                                                        v_roll.counted_total, 4::bigint);
  perform pg_temp.must_equal('rollup: completion_rate is 3/4, not 3/5',
                                                        v_roll.completion_rate, 0.7500::numeric);
  perform pg_temp.must_equal('rollup: nc_rate is 1/5',  v_roll.nc_rate,       0.2000::numeric);

  -- OQ-2: >= 0.70 and at least 3 counted tasks. 0.75 over 4 clears both.
  perform pg_temp.must_equal('rollup: this is a kept week', v_roll.is_kept_week, true);
end $$;

-- A week that clears the rate but not the volume ------------------------------
-- Two-for-two is 100%, and OQ-2 says it is still not a kept week. Without the
-- minimum, the cheapest way to hold a streak would be to plan one easy task.

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_week date := date_trunc('week', current_date)::date + 210;
  v_task uuid;
  v_i    int;
  v_roll v_week_rollup;
begin
  for v_i in 1..2 loop
    insert into tasks (user_id, title, week_start)
    values (v_user, 'Thin week fixture ' || v_i, v_week)
    returning id into v_task;
    update tasks set is_finalized = true, finalized_at = v_week::timestamptz where id = v_task;
    perform close_task(v_task, 'C', 'Done, but this was a very thin week of planning.');
  end loop;

  select * into v_roll from v_week_rollup where user_id = v_user and week_start = v_week;

  perform pg_temp.must_equal('thin week: completion_rate', v_roll.completion_rate, 1.0000::numeric);
  perform pg_temp.must_equal('thin week: 100% over only 2 tasks is NOT kept',
                             v_roll.is_kept_week, false);
end $$;

rollback;
