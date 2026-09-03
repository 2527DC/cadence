-- 0010_rls_policies.sql
-- Source of truth: doc/03-data-model-supabase.md §6
--
-- Two independent layers stop deletion of a finalized task: the RLS policy denies it,
-- and the trigger in 0006 raises even if the policy were ever loosened. Neither alone
-- is enough - RLS can be edited in a panic, and triggers can be dropped. Both being
-- present means a mistake needs two mistakes.
--
-- There is a third, quieter layer here: the GRANTs. RLS only filters rows the role is
-- already allowed to touch, so a missing DELETE grant stops a delete before any policy
-- is consulted. Where the doc says "no delete policy", this file also withholds the
-- delete privilege.

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table profiles            enable row level security;
alter table goals               enable row level security;
alter table tasks               enable row level security;
alter table task_status_events  enable row level security;
alter table voice_notes         enable row level security;
alter table threads             enable row level security;
alter table messages            enable row level security;
alter table weekly_reviews      enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges. `anon` gets nothing: this app has no logged-out surface.
-- ---------------------------------------------------------------------------

grant select, insert, update         on profiles           to authenticated;
grant select, insert, update         on goals              to authenticated;  -- no delete: archive instead
grant select, insert, update, delete on tasks              to authenticated;  -- delete gated to drafts by policy
grant select, insert                 on task_status_events to authenticated;  -- append only. R4.
grant select, insert, update         on voice_notes        to authenticated;  -- recordings are permanent
grant select, insert, update         on threads            to authenticated;
grant select, insert, update         on messages           to authenticated;
grant select, insert, update         on weekly_reviews     to authenticated;

revoke execute on function close_task(uuid, task_status, text, uuid, nc_reason) from public;
grant  execute on function close_task(uuid, task_status, text, uuid, nc_reason) to authenticated, service_role;

revoke execute on function public.handle_new_user() from public;

-- ---------------------------------------------------------------------------
-- profiles - keyed on id, not user_id
-- ---------------------------------------------------------------------------

create policy own_select on profiles for select using (auth.uid() = id);
create policy own_insert on profiles for insert with check (auth.uid() = id);
create policy own_update on profiles for update using (auth.uid() = id);
-- no delete policy: a profile goes when its auth.users row goes, by cascade.

-- ---------------------------------------------------------------------------
-- goals - archive, never delete
-- ---------------------------------------------------------------------------

create policy own_select on goals for select using (auth.uid() = user_id);
create policy own_insert on goals for insert with check (auth.uid() = user_id);
create policy own_update on goals for update using (auth.uid() = user_id);
-- no delete policy.

-- ---------------------------------------------------------------------------
-- tasks - delete is permitted ONLY for drafts
-- ---------------------------------------------------------------------------

create policy tasks_select on tasks for select using (auth.uid() = user_id);
create policy tasks_insert on tasks for insert with check (auth.uid() = user_id);
create policy tasks_update on tasks for update using (auth.uid() = user_id);
create policy tasks_delete on tasks for delete
  using (auth.uid() = user_id and is_finalized = false);

-- ---------------------------------------------------------------------------
-- task_status_events - insert and select only. Ever.
-- ---------------------------------------------------------------------------

create policy tse_select on task_status_events for select using (auth.uid() = user_id);
create policy tse_insert on task_status_events for insert with check (auth.uid() = user_id);
-- no update policy. no delete policy. this is deliberate.

-- ---------------------------------------------------------------------------
-- voice_notes, threads, messages, weekly_reviews - the standard owner pattern
-- ---------------------------------------------------------------------------

create policy own_select on voice_notes for select using (auth.uid() = user_id);
create policy own_insert on voice_notes for insert with check (auth.uid() = user_id);
create policy own_update on voice_notes for update using (auth.uid() = user_id);

create policy own_select on threads for select using (auth.uid() = user_id);
create policy own_insert on threads for insert with check (auth.uid() = user_id);
create policy own_update on threads for update using (auth.uid() = user_id);

create policy own_select on messages for select using (auth.uid() = user_id);
create policy own_insert on messages for insert with check (auth.uid() = user_id);
create policy own_update on messages for update using (auth.uid() = user_id);

create policy own_select on weekly_reviews for select using (auth.uid() = user_id);
create policy own_insert on weekly_reviews for insert with check (auth.uid() = user_id);
create policy own_update on weekly_reviews for update using (auth.uid() = user_id);
