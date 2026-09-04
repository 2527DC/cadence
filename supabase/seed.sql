-- seed.sql
--
-- Four weeks of realistic history for one user, plus a second user who exists only so
-- the isolation tests have someone else's data to fail to see.
--
-- Every closed task here goes through close_task(). Nothing inserts a row that is
-- already closed, and nothing writes the ledger directly — partly because 0006 and 0015
-- forbid both, and partly because a seed that takes a shortcut the app cannot take is a
-- seed that tests nothing.
--
-- Structured in four passes rather than one loop, and the reason is the middle one:
--
--   A. auth.users                       as postgres
--   B. goals and DRAFT tasks            as authenticated, the way the app creates them
--   C. finalize, backdated              as postgres with triggers off  <- see below
--   D. close them honestly              as authenticated, through the RPC
--
-- Pass C exists because 0015 made finalized_at and late_add the database's to decide:
-- mark_late_add() now overwrites whatever the client sends, so a backdated commitment
-- is impossible through normal channels. That is the point of the fix. Seed history
-- still wants to look like four real weeks, so it suspends triggers the same way a
-- pg_restore does — `session_replication_role = replica`, which needs superuser and is
-- therefore not a door the app can open. See supabase/README.md.
--
-- Run as: node supabase/db.mjs seed   (wrapped in a single transaction by the runner)

-- ---------------------------------------------------------------------------
-- A. Auth users. Only the platform writes these, so this part runs as postgres.
--    The profile rows appear by way of the on_auth_user_created trigger from 0001.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'bharath@example.test',
   '{"display_name": "Bharath"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'someone.else@example.test',
   '{"display_name": "Not Bharath"}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- B. Goals and draft tasks, exactly as the app creates them.
--    If any statement here needed superuser, that would be a bug in the schema.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_user   uuid := '11111111-1111-1111-1111-111111111111';
  v_w0     date := date_trunc('week', current_date)::date;   -- this Monday
  v_goal_fitness uuid;
  v_goal_writing uuid;
  v_goal_learning uuid;
  v_week   date;
  v_i      int;
  v_n      int;
  v_titles text[] := array[
    'Run 5k before work',
    'Strength session, legs',
    'Write 500 words on the essay',
    'Edit yesterday''s draft',
    'One chapter of the Postgres book',
    'Rebuild the query planner notes'
  ];
begin
  insert into goals (user_id, title, description, category, color, target_per_week, start_week)
  values (v_user, 'Move every day', 'Running or strength, six days a week.',
          'health', '#16A34A', 5, v_w0 - 21)
  returning id into v_goal_fitness;

  insert into goals (user_id, title, description, category, color, target_per_week, start_week)
  values (v_user, 'Finish the essay', 'Five hundred words a day until the draft is done.',
          'writing', '#4F46E5', 4, v_w0 - 21)
  returning id into v_goal_writing;

  insert into goals (user_id, title, description, category, color, target_per_week, start_week)
  values (v_user, 'Learn Postgres properly', 'One chapter a week, with notes.',
          'learning', '#D97757', 2, v_w0 - 21)
  returning id into v_goal_learning;

  -- Four weeks of drafts. planned_for encodes which task this is within its week, so
  -- pass D can recognise them again without threading ids through.
  for v_i in 0..3 loop
    v_week := v_w0 - (v_i * 7);

    for v_n in 1..6 loop
      insert into tasks (user_id, goal_id, title, week_start, planned_for, weight)
      values (
        v_user,
        case
          when v_n <= 2 then v_goal_fitness
          when v_n <= 4 then v_goal_writing
          else v_goal_learning
        end,
        v_titles[v_n],
        v_week,
        v_week + (v_n - 1),
        1                                   -- OQ-8: weights exist, UI does not yet
      );
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- C. Finalize, with the commitment dates backdated into their own weeks.
--
--    Triggers off, because 0015 deliberately makes this impossible with them on.
--    Everything was committed on the Monday except one task in the w-1 week, which was
--    committed on the Friday — that one exists so `late_add` has something to be true
--    about, and the dashboard has a late add to draw.
-- ---------------------------------------------------------------------------

reset role;
set local session_replication_role = replica;

update tasks t
   set is_finalized = true,
       finalized_at = c.at,
       late_add     = extract(isodow from (c.at at time zone 'Asia/Kolkata')) > 3
  from (
    select id,
           (week_start
             + case
                 -- the w-1 week's sixth task: committed on the Friday
                 when week_start = date_trunc('week', current_date)::date - 7
                  and planned_for = week_start + 5 then 4
                 else 0
               end)::timestamptz + time '09:00' as at
      from tasks
     where user_id = '11111111-1111-1111-1111-111111111111'
       and not is_finalized
  ) c
 where t.id = c.id;

reset session_replication_role;

-- ---------------------------------------------------------------------------
-- D. Close them, honestly, through the only door.
--
--    Shape of the history, after the correction at the end of this block:
--      w-3  4 C, 2 N          0.6667  not kept — started 5 C / 1 N, then one C was
--                                     corrected to N. That correction is what drops the
--                                     week below the threshold, which is the entire
--                                     point of the app in one row.
--      w-2  2 C, 4 N          0.3333  not kept, the bad week
--      w-1  5 C, 1 NC         1.0000  kept. NC is out of the denominator, so 5/5.
--      w0   6 finalized, OPEN  null   in progress
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_w0    date := date_trunc('week', current_date)::date;
  v_task  record;
  v_i     int;
  v_n     int;
  v_notes text[] := array[
    'Got out the door at six and finished the whole loop without stopping.',
    'Legs were heavy from Monday but I finished every set as written.',
    'Wrote the section on why the record has to be immutable. Rough but real.',
    'Cut about a third of it. The argument is tighter now.',
    'Read the chapter on index-only scans and took notes properly this time.',
    'Went back over the planner notes and reorganised them by cost model.'
  ];
  v_misses text[] := array[
    'Slept through the alarm. No excuse beyond going to bed too late.',
    'Ran out of evening after work ran over. Should have moved it earlier.',
    'Sat down to write and did email instead for an hour, then gave up.'
  ];
begin
  for v_task in
    select id, week_start, planned_for from tasks
     where user_id = v_user and status = 'OPEN'
     order by week_start desc, planned_for
  loop
    v_i := (v_w0 - v_task.week_start) / 7;          -- 0 = this week, 3 = oldest
    v_n := (v_task.planned_for - v_task.week_start) + 1;

    -- The current week stays open. Everything older gets closed.
    continue when v_i = 0;

    if v_i = 2 and v_n > 2 then
      perform close_task(v_task.id, 'N', v_misses[1 + (v_n % 3)]);
    elsif v_i = 1 and v_n = 3 then
      -- knocked out for two days; NC exists so this does not count against the rate
      perform close_task(v_task.id, 'NC',
        'Down with a fever from Tuesday. Did not open the laptop at all.',
        null, 'illness');
    elsif v_i = 3 and v_n = 6 then
      perform close_task(v_task.id, 'N', v_misses[2]);
    else
      perform close_task(v_task.id, 'C', v_notes[v_n]);
    end if;
  end loop;

  -- A reopened case: closed C, then honestly corrected to N.
  -- This is the history the app exists to keep. Both events survive; the ledger shows
  -- the correction rather than hiding it.
  perform close_task(
    (select id from tasks
      where user_id = v_user and week_start = v_w0 - 21 and status = 'C'
      order by planned_for limit 1),
    'N',
    'Marked this complete on the day and it was not. I did half of it and stopped.');

  -- Chat -------------------------------------------------------------------
  insert into threads (user_id, goal_id, title, kind)
  values (v_user, null, 'Daily log', 'daily_log');

  insert into messages (user_id, thread_id, kind, body)
  select v_user, t.id, 'text',
         'Starting to notice the pattern: the weeks I plan on Sunday are the weeks I keep.'
    from threads t where t.user_id = v_user and t.kind = 'daily_log';

  -- Weekly review for the worst week, with its numbers frozen at review time ---
  insert into weekly_reviews (user_id, week_start, summary, stats)
  select v_user, v_w0 - 14,
         'Bad week and I know why. Two late nights and the whole rhythm went.',
         to_jsonb(r) - 'user_id'
    from v_week_rollup r
   where r.user_id = v_user and r.week_start = v_w0 - 14;
end $$;

-- ---------------------------------------------------------------------------
-- The other user. One goal and one finalized task, so the isolation tests have a
-- concrete row that must never be visible to user one.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

do $$
declare
  v_user uuid := '22222222-2222-2222-2222-222222222222';
  v_goal uuid;
  v_task uuid;
begin
  insert into goals (user_id, title, target_per_week, start_week)
  values (v_user, 'Private to the other user', 3, date_trunc('week', current_date)::date - 7)
  returning id into v_goal;

  insert into tasks (user_id, goal_id, title, week_start)
  values (v_user, v_goal, 'This row must never be visible to user one',
          date_trunc('week', current_date)::date - 7)
  returning id into v_task;

  -- No backdating here: this row exists to be invisible, not to look realistic, so it
  -- takes whatever finalized_at the trigger decides.
  update tasks set is_finalized = true where id = v_task;
  perform close_task(v_task, 'C', 'A note belonging to somebody else entirely.');
end $$;

reset role;
