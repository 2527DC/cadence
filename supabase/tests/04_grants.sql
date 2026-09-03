-- tests/04_grants.sql
--
-- The privilege layer, asserted directly.
--
-- The other three test files exercise behaviour: they try things and check they are
-- refused. This one checks the grant table itself, because the failure it guards
-- against is invisible from behaviour alone.
--
-- The story is in 0014. A hosted Supabase project grants ALL on every new table in
-- `public` to `anon` and `authenticated`, which handed out DELETE and UPDATE on the
-- append-only ledger and TRUNCATE on everything. RLS still refused the DELETEs, so
-- nothing looked wrong — but **TRUNCATE ignores RLS and does not fire row-level DELETE
-- triggers**, so one statement from any signed-up user emptied every table.
--
-- No behavioural test would have caught the DELETE grants, because RLS was masking
-- them. Hence a test that reads pg_catalog.

\set ON_ERROR_STOP on

begin;

create function pg_temp.privs(p_role text, p_table text)
returns text language sql stable as $fn$
  select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), '(none)')
    from information_schema.role_table_grants
   where grantee = p_role and table_schema = 'public' and table_name = p_table;
$fn$;

create function pg_temp.must_have(p_role text, p_table text, p_expected text)
returns void language plpgsql as $fn$
declare
  v_actual text := pg_temp.privs(p_role, p_table);
begin
  if v_actual is distinct from p_expected then
    raise exception 'FAIL  %.% : expected [%], got [%]', p_role, p_table, p_expected, v_actual;
  end if;
  raise notice 'PASS  %-14s %-20s %s', p_role, p_table, v_actual;
end $fn$;

do $$
declare
  v_t text;
begin
  -- anon holds nothing at all. There is no logged-out surface in this app.
  foreach v_t in array array['profiles','goals','tasks','task_status_events',
                             'voice_notes','threads','messages','weekly_reviews',
                             'v_week_rollup','v_goal_progress']
  loop
    perform pg_temp.must_have('anon', v_t, '(none)');
  end loop;

  -- authenticated holds exactly what the design calls for. Read the absences.
  perform pg_temp.must_have('authenticated', 'profiles',           'INSERT,SELECT,UPDATE');
  perform pg_temp.must_have('authenticated', 'goals',              'INSERT,SELECT,UPDATE');
  perform pg_temp.must_have('authenticated', 'tasks',              'DELETE,INSERT,SELECT,UPDATE');
  perform pg_temp.must_have('authenticated', 'task_status_events', 'INSERT,SELECT');
  perform pg_temp.must_have('authenticated', 'voice_notes',        'INSERT,SELECT,UPDATE');
  perform pg_temp.must_have('authenticated', 'threads',            'INSERT,SELECT,UPDATE');
  perform pg_temp.must_have('authenticated', 'messages',           'INSERT,SELECT,UPDATE');
  perform pg_temp.must_have('authenticated', 'weekly_reviews',     'INSERT,SELECT,UPDATE');
  perform pg_temp.must_have('authenticated', 'v_week_rollup',      'SELECT');
  perform pg_temp.must_have('authenticated', 'v_goal_progress',    'SELECT');
end $$;

-- TRUNCATE, specifically, on every table ------------------------------------
-- Called out on its own because it is the one privilege that neither RLS nor a
-- trigger can restrain. If this assertion ever fails, the record can be erased
-- wholesale regardless of every other guarantee in this schema.

do $$
declare
  v_leak text;
begin
  select string_agg(table_name || ' (' || grantee || ')', ', ' order by table_name)
    into v_leak
    from information_schema.role_table_grants
   where table_schema = 'public'
     and privilege_type = 'TRUNCATE'
     and grantee in ('anon', 'authenticated');

  if v_leak is not null then
    raise exception
      'FAIL  TRUNCATE is granted to a client role on: %. TRUNCATE ignores RLS and does not fire row-level DELETE triggers, so this erases the record wholesale.',
      v_leak;
  end if;
  raise notice 'PASS  TRUNCATE is granted to no client role on any table';
end $$;

-- The same for the default privileges that apply to tables created later -----

do $$
declare
  v_bad text;
begin
  select string_agg(acl::text, ', ') into v_bad
    from pg_default_acl d, unnest(d.defaclacl) acl
   where d.defaclnamespace = 'public'::regnamespace
     and d.defaclobjtype = 'r'
     and (acl::text like 'anon=%' or acl::text like 'authenticated=%');

  if v_bad is not null then
    raise exception
      'FAIL  default privileges still grant client roles access to future tables: %', v_bad;
  end if;
  raise notice 'PASS  future tables in public start with no client-role privileges';
end $$;

rollback;
