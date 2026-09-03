-- tests/03_isolation.sql
--
-- "A second user's JWT cannot select ANY row from any table."
--
-- The seed gives user two a goal and a closed task of their own, so this is not the
-- empty-database trick where everything passes because there is nothing to see. User
-- one has four weeks of history; user two must see exactly none of it, and vice versa.
--
-- The views get their own section. Since Postgres 15 a view runs with its OWNER's
-- privileges unless declared `security_invoker = true`, and these views are owned by
-- a superuser. Get that wrong and every table below is locked down perfectly while
-- v_week_rollup hands out the whole table to anyone who asks. 0011 sets the flag;
-- this is the test that would catch it going missing.

\set ON_ERROR_STOP on

begin;

create function pg_temp.must_count(p_label text, p_sql text, p_expected bigint)
returns void language plpgsql as $fn$
declare
  v_actual bigint;
begin
  execute p_sql into v_actual;
  if v_actual is distinct from p_expected then
    raise exception 'FAIL  %: expected % row(s) visible, got %', p_label, p_expected, v_actual;
  end if;
  raise notice 'PASS  % -> % row(s) visible', p_label, v_actual;
end $fn$;

-- ---------------------------------------------------------------------------
-- What actually exists, seen from outside RLS
-- ---------------------------------------------------------------------------

do $$
declare
  v_one bigint;
  v_two bigint;
begin
  select count(*) into v_one from tasks where user_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into v_two from tasks where user_id = '22222222-2222-2222-2222-222222222222';
  raise notice 'PASS  fixture check: user one has % task(s), user two has %', v_one, v_two;
  if v_one = 0 or v_two = 0 then
    raise exception 'FAIL  the seed did not create data for both users, so this file would pass vacuously';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- As user two: none of user one's data is reachable
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_one text := '11111111-1111-1111-1111-111111111111';
begin
  perform pg_temp.must_count('user two selecting user one''s profiles',
    'select count(*) from profiles where id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s goals',
    'select count(*) from goals where user_id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s tasks',
    'select count(*) from tasks where user_id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s status events',
    'select count(*) from task_status_events where user_id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s voice notes',
    'select count(*) from voice_notes where user_id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s threads',
    'select count(*) from threads where user_id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s messages',
    'select count(*) from messages where user_id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s weekly reviews',
    'select count(*) from weekly_reviews where user_id = ''' || v_one || '''', 0);

  -- The views. This is the assertion that catches a missing security_invoker.
  perform pg_temp.must_count('user two selecting user one''s week rollups (VIEW)',
    'select count(*) from v_week_rollup where user_id = ''' || v_one || '''', 0);
  perform pg_temp.must_count('user two selecting user one''s goal progress (VIEW)',
    'select count(*) from v_goal_progress where user_id = ''' || v_one || '''', 0);

  -- Unfiltered: user two should see their own single task and nothing else.
  perform pg_temp.must_count('user two''s unfiltered view of tasks',
    'select count(*) from tasks', 1);
end $$;

-- Writing into someone else's account is refused too --------------------------

do $$
begin
  begin
    insert into tasks (user_id, title, week_start)
    values ('11111111-1111-1111-1111-111111111111', 'Planted in another account',
            date_trunc('week', current_date)::date);
    raise exception 'FAIL  user two inserted a task into user one''s account';
  exception when insufficient_privilege then
    raise notice 'PASS  inserting a task for another user -> %', sqlerrm;
  end;
end $$;

-- You cannot give one of your own rows away ----------------------------------
-- Reassigning user_id would plant a permanent row in someone else's history — tasks
-- cannot be deleted — and would move their completion rate. So it must be refused.
--
-- This passes under 0010's policies as well as 0013's, and that is the point worth
-- recording: an UPDATE policy that omits WITH CHECK is not missing its check. Postgres
-- reuses the USING expression as the check on the new row, so both shapes reject this.
-- 0013 only writes the implicit behaviour down. This test exists so that a future edit
-- which sets WITH CHECK to something genuinely weaker gets caught.

do $$
declare
  v_mine uuid;
  v_rows bigint;
begin
  select id into strict v_mine from tasks
   where user_id = '22222222-2222-2222-2222-222222222222' limit 1;

  update tasks set user_id = '11111111-1111-1111-1111-111111111111' where id = v_mine;

  raise exception 'FAIL  a task was reassigned to another user. WITH CHECK is missing.';
exception
  -- A row that would violate WITH CHECK raises rather than silently doing nothing,
  -- which is why this is checked with an exception handler and not a row count.
  when insufficient_privilege then
    raise notice 'PASS  reassigning your own task to another user -> %', sqlerrm;
end $$;

-- ... and the same for a goal, which has the same policy shape.

do $$
declare
  v_mine uuid;
begin
  select id into strict v_mine from goals
   where user_id = '22222222-2222-2222-2222-222222222222' limit 1;

  update goals set user_id = '11111111-1111-1111-1111-111111111111' where id = v_mine;

  raise exception 'FAIL  a goal was reassigned to another user. WITH CHECK is missing.';
exception when insufficient_privilege then
  raise notice 'PASS  reassigning your own goal to another user -> %', sqlerrm;
end $$;

-- close_task() cannot reach across accounts -----------------------------------
-- It is `security invoker`, so RLS applies inside it: the SELECT ... FOR UPDATE
-- finds nothing and the function reports the task as missing rather than closing it.

do $$
declare
  v_victim uuid;
begin
  reset role;
  select id into v_victim from tasks
   where user_id = '11111111-1111-1111-1111-111111111111' and status = 'C' limit 1;
  set local role authenticated;

  begin
    perform close_task(v_victim, 'N', 'Closing a task that is not mine to close at all.');
    raise exception 'FAIL  user two closed one of user one''s tasks';
  exception when no_data_found then
    raise notice 'PASS  close_task on another user''s task -> %', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- And the same in the other direction
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
declare
  v_two text := '22222222-2222-2222-2222-222222222222';
begin
  perform pg_temp.must_count('user one selecting user two''s tasks',
    'select count(*) from tasks where user_id = ''' || v_two || '''', 0);
  perform pg_temp.must_count('user one selecting user two''s goals',
    'select count(*) from goals where user_id = ''' || v_two || '''', 0);
  perform pg_temp.must_count('user one selecting user two''s week rollups (VIEW)',
    'select count(*) from v_week_rollup where user_id = ''' || v_two || '''', 0);
end $$;

-- ---------------------------------------------------------------------------
-- Storage: the voice-notes bucket is per-user by path
-- ---------------------------------------------------------------------------
-- Path convention is voice-notes/{user_id}/{uuid}.m4a, and the policies in 0012 key
-- off the first folder segment. Locally these run against the shim's storage tables.

do $$
begin
  -- user one writing into their own folder
  insert into storage.objects (bucket_id, name)
  values ('voice-notes', '11111111-1111-1111-1111-111111111111/' || gen_random_uuid() || '.m4a');
  raise notice 'PASS  writing a recording into your own storage folder -> allowed';

  begin
    insert into storage.objects (bucket_id, name)
    values ('voice-notes', '22222222-2222-2222-2222-222222222222/' || gen_random_uuid() || '.m4a');
    raise exception 'FAIL  user one wrote a recording into user two''s storage folder';
  exception when insufficient_privilege then
    raise notice 'PASS  writing into another user''s storage folder -> %', sqlerrm;
  end;

  perform pg_temp.must_count('user one reading user two''s recordings',
    'select count(*) from storage.objects
      where name like ''22222222-2222-2222-2222-222222222222/%''', 0);
end $$;

rollback;
