-- 0013_harden_rls_policies.sql
--
-- Hardening of the policies written in 0010, following Supabase's own RLS guidance
-- (the `supabase` agent skill, installed 2026-09-03). Migrations are append-only, so
-- 0010 is left as history and every policy is replaced here.
--
-- READ THIS FIRST, because the commit that introduced this file originally claimed
-- otherwise: **0010 was not vulnerable.** This migration is hygiene and performance,
-- not a security fix. Nothing was exploitable before it.
--
-- 1. `auth.uid()` IS NOW WRAPPED AS `(select auth.uid())`. This is the only change
--    with a measurable effect. Postgres treats the subquery as an InitPlan and
--    evaluates it once per statement instead of once per row. Across a scan of a few
--    thousand tasks that is one function call rather than a few thousand.
--
-- 2. EVERY POLICY NOW NAMES ITS ROLE with `TO authenticated`. Previously they were
--    evaluated for `anon` too. `anon` holds no grants on any of these tables so it
--    could never reach them, but naming the role states the intent and stops a future
--    grant from silently widening access.
--
-- 3. UPDATE POLICIES NOW SPELL OUT `WITH CHECK`. This changes no behaviour. Postgres
--    documents that when an UPDATE policy omits WITH CHECK, **the USING expression is
--    used as the check on the new row as well** — so `update tasks set user_id =
--    '<someone else>'` was already rejected under 0010, and this was verified against
--    the old policy before writing this file. Writing it out is worth doing anyway:
--    the implicit behaviour is easy to misread, and the day USING and WITH CHECK need
--    to differ, the shape is already there.
--
-- Behaviour that is deliberately unchanged: goals and the event ledger still have no
-- DELETE policy, task_status_events still has no UPDATE policy, and tasks may still be
-- deleted only while they are drafts.

-- ---------------------------------------------------------------------------
-- profiles - keyed on id, not user_id
-- ---------------------------------------------------------------------------

drop policy if exists own_select on profiles;
drop policy if exists own_insert on profiles;
drop policy if exists own_update on profiles;

create policy own_select on profiles for select
  to authenticated using ((select auth.uid()) = id);
create policy own_insert on profiles for insert
  to authenticated with check ((select auth.uid()) = id);
create policy own_update on profiles for update
  to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- goals - archive, never delete
-- ---------------------------------------------------------------------------

drop policy if exists own_select on goals;
drop policy if exists own_insert on goals;
drop policy if exists own_update on goals;

create policy own_select on goals for select
  to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on goals for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on goals for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- tasks - delete is permitted ONLY for drafts
-- ---------------------------------------------------------------------------

drop policy if exists tasks_select on tasks;
drop policy if exists tasks_insert on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists tasks_delete on tasks;

create policy tasks_select on tasks for select
  to authenticated using ((select auth.uid()) = user_id);
create policy tasks_insert on tasks for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy tasks_update on tasks for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy tasks_delete on tasks for delete
  to authenticated using ((select auth.uid()) = user_id and is_finalized = false);

-- ---------------------------------------------------------------------------
-- task_status_events - insert and select only. Ever.
-- ---------------------------------------------------------------------------

drop policy if exists tse_select on task_status_events;
drop policy if exists tse_insert on task_status_events;

create policy tse_select on task_status_events for select
  to authenticated using ((select auth.uid()) = user_id);
create policy tse_insert on task_status_events for insert
  to authenticated with check ((select auth.uid()) = user_id);
-- still no update policy. still no delete policy. this is deliberate.

-- ---------------------------------------------------------------------------
-- voice_notes, threads, messages, weekly_reviews - the standard owner pattern
-- ---------------------------------------------------------------------------

drop policy if exists own_select on voice_notes;
drop policy if exists own_insert on voice_notes;
drop policy if exists own_update on voice_notes;

create policy own_select on voice_notes for select
  to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on voice_notes for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on voice_notes for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists own_select on threads;
drop policy if exists own_insert on threads;
drop policy if exists own_update on threads;

create policy own_select on threads for select
  to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on threads for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on threads for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists own_select on messages;
drop policy if exists own_insert on messages;
drop policy if exists own_update on messages;

create policy own_select on messages for select
  to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on messages for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on messages for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists own_select on weekly_reviews;
drop policy if exists own_insert on weekly_reviews;
drop policy if exists own_update on weekly_reviews;

create policy own_select on weekly_reviews for select
  to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on weekly_reviews for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on weekly_reviews for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- storage: the voice-notes bucket, keyed on the first folder segment
-- ---------------------------------------------------------------------------

drop policy if exists "own voice notes read" on storage.objects;
drop policy if exists "own voice notes write" on storage.objects;

create policy "own voice notes read" on storage.objects for select
  to authenticated
  using (bucket_id = 'voice-notes'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own voice notes write" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'voice-notes'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

-- still no update policy and no delete policy: recordings are permanent.
