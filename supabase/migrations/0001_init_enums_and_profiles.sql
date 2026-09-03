-- 0001_init_enums_and_profiles.sql
-- Enums, profiles, and the trigger that gives every new auth user a profile row.
-- Source of truth: doc/03-data-model-supabase.md §2, §3.1

create type task_status  as enum ('OPEN', 'N', 'C', 'NC');
create type goal_state   as enum ('active', 'paused', 'archived');
create type message_kind as enum ('text', 'voice');
create type nc_reason    as enum ('illness', 'blocked_by_others', 'cancelled_externally',
                                  'plan_changed', 'other');
create type transcript_status as enum ('pending', 'on_device', 'cloud', 'failed');

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  timezone      text not null default 'Asia/Kolkata',      -- OQ-1, locked 2026-09-02
  week_start_day smallint not null default 1,              -- 1 = Monday
  streak_threshold numeric not null default 0.70,          -- OQ-2, locked 2026-09-02
  created_at    timestamptz not null default now()
);

-- OQ-2 also fixed the minimum counted tasks for a "kept" week at 3. That is not a
-- per-user setting today, so it lives in the analytics layer (0011), not here.

-- Every auth user gets exactly one profile, created by the database rather than the
-- client — a client that forgets to do it would leave orphaned auth users that own
-- nothing, and every FK in this schema points at profiles(id).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
