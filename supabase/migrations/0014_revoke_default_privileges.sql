-- 0014_revoke_default_privileges.sql
--
-- Restores the privilege layer that 0010 built and a hosted Supabase project silently
-- removes. This one IS a security fix, and it was demonstrated before it was written.
--
-- WHAT HAPPENED
--
-- 0010 uses grants as a third layer behind RLS and the triggers: where the design says
-- "no delete", the role is not given DELETE at all, so the statement is refused before
-- any policy is consulted. That works locally, where this project controls every grant.
--
-- A hosted Supabase project ships with default privileges that grant ALL on new tables
-- in `public` to `anon`, `authenticated` and `service_role`. So the moment 0001-0009
-- created these tables there, every role held:
--
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- on all eight tables and both views — including DELETE and UPDATE on
-- `task_status_events`, the append-only ledger. RLS still refused those (there is no
-- policy for either), so nothing was reachable through PostgREST. The layer was gone,
-- but the door was still shut.
--
-- TRUNCATE is the one that actually breaks the promise. **RLS does not apply to
-- TRUNCATE, and TRUNCATE does not fire row-level DELETE triggers.** Neither
-- `prevent_finalized_task_delete` nor a single policy has any effect on it. Reproduced
-- against the local database with the hosted grant set applied, as `authenticated`:
--
--     truncate tasks, task_status_events, goals, ... cascade;
--     -- 24 finalized tasks -> 0
--     -- 19 ledger rows     -> 0
--
-- Both layers the design relies on were bypassed by one statement, by a role any
-- sign-up receives.
--
-- THE FIX
--
-- Revoke everything from `anon` and `authenticated`, then re-grant exactly the matrix
-- 0010 intended and nothing else. `service_role` is left alone: it holds BYPASSRLS by
-- design and is never used from the app.
--
-- Idempotent, and a no-op against the local database, where these grants were never
-- issued in the first place.

-- ---------------------------------------------------------------------------
-- 1. Take everything back
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;
revoke all on all functions in schema public from anon;

-- `anon` keeps schema usage so PostgREST can still answer, and gets nothing else.
-- This app has no logged-out surface: every screen requires a session.
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Re-grant exactly the matrix from 0010, and only that
-- ---------------------------------------------------------------------------
-- Read the absences: no DELETE except on tasks, no UPDATE or DELETE on the ledger,
-- and TRUNCATE nowhere at all.

grant select, insert, update         on profiles           to authenticated;
grant select, insert, update         on goals              to authenticated;  -- archive, never delete
grant select, insert, update, delete on tasks              to authenticated;  -- delete gated to drafts by policy
grant select, insert                 on task_status_events to authenticated;  -- append only. R4.
grant select, insert, update         on voice_notes        to authenticated;  -- recordings are permanent
grant select, insert, update         on threads            to authenticated;
grant select, insert, update         on messages           to authenticated;
grant select, insert, update         on weekly_reviews     to authenticated;

grant select on v_week_rollup, v_goal_progress to authenticated;

grant execute on function close_task(uuid, task_status, text, uuid, nc_reason)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Stop it happening again for tables created later
-- ---------------------------------------------------------------------------
-- Without this, the next migration that creates a table gets the blanket grant back
-- and the layer quietly disappears again. After this, a new table starts unreachable
-- and its migration must grant what it needs explicitly.
--
-- That is the safe direction to fail: a forgotten grant shows up immediately as
-- "permission denied" in development, whereas a forgotten revoke shows up as nothing
-- at all until someone goes looking.

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;
