-- 0011_analytics_views.sql
-- Source of truth: doc/03-data-model-supabase.md §7, formulas in doc/05-analytics-spec.md
--
-- DEVIATION from the doc, and an important one: both views are declared
-- `with (security_invoker = true)`.
--
-- Since Postgres 15 a view runs with the privileges of its OWNER unless told
-- otherwise. These views are owned by `postgres`, a superuser, which bypasses RLS.
-- Without security_invoker, `select * from v_week_rollup` as any authenticated user
-- would return EVERY user's weeks. The tables underneath are locked down correctly
-- and the view would hand the data out anyway. tests/03_isolation.sql covers this.

create view v_week_rollup with (security_invoker = true) as
with agg as (
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
  group by user_id, week_start
)
select
  agg.*,
  -- OQ-2, locked 2026-09-02: a kept week is >= streak_threshold (default 0.70)
  -- AND at least 3 counted tasks.
  --
  -- The third clause of OQ-2 - "a week with zero finalized tasks BREAKS the streak" -
  -- cannot live here, because such a week produces no row in this view at all. The
  -- streak walker in P09 must generate the full week series and treat a missing week
  -- as broken. If it instead walks only the rows this view returns, the easiest way to
  -- protect a streak becomes to stop planning, which is the exact behaviour the app
  -- exists to catch.
  (coalesce(agg.counted_total, 0) >= 3
   and coalesce(agg.completion_rate, 0) >= p.streak_threshold) as is_kept_week
from agg
join profiles p on p.id = agg.user_id;

create view v_goal_progress with (security_invoker = true) as
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

grant select on v_week_rollup, v_goal_progress to authenticated;
