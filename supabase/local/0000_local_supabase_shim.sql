-- 0000_local_supabase_shim.sql
--
-- LOCAL ONLY. This file is NOT a migration and must never run against a hosted
-- Supabase project — everything in it is something Supabase already provides.
--
-- P01 calls for `supabase start` (Docker). We run against the PostgreSQL 17 install
-- on this machine instead, so the three things the hosted platform supplies for free
-- have to be stood up by hand:
--
--   1. the `auth` schema, `auth.users`, and `auth.uid()`  — RLS reads from these
--   2. the `storage` schema, buckets/objects, `storage.foldername()` — migration 0012
--   3. the `anon` / `authenticated` / `service_role` roles
--
-- Keeping this out of `migrations/` is deliberate: it means every file in that folder
-- is byte-for-byte the same SQL a real Supabase project would run, which is what P01's
-- definition of done asks for.
--
-- Idempotent: safe to run repeatedly.

-- No extensions are created here on purpose. The only one this schema would have
-- wanted is pgcrypto, for gen_random_uuid() — and that has been in core Postgres
-- since 13, so installing pgcrypto would only litter the `public` schema with three
-- dozen crypto functions that then show up in the generated TypeScript types.

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------
-- These already exist server-wide on this machine from an earlier project, so every
-- create is guarded. `authenticated` deliberately has neither SUPERUSER nor BYPASSRLS:
-- if it had either, every RLS test in tests/ would pass for the wrong reason.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'root';
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- ---------------------------------------------------------------------------
-- 2. auth schema
-- ---------------------------------------------------------------------------

create schema if not exists auth;

-- A subset of Supabase's real auth.users: the columns this app actually touches,
-- with the same names and types so the on-signup trigger in 0001 transplants unchanged.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  aud                text default 'authenticated',
  role               text default 'authenticated',
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Supabase's own definitions, reproduced exactly. PostgREST sets `request.jwt.claims`
-- as a transaction-local GUC on every request; the tests do the same thing by hand:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--
-- `stable` (not `immutable`) matters — the value changes between statements.

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. storage schema
-- ---------------------------------------------------------------------------
-- Enough of Supabase Storage for migration 0012's bucket row and its RLS policies to
-- apply verbatim. Local file bytes are NOT stored here — P06 decides that. What this
-- gives us today is that the storage policies are real, testable SQL rather than a
-- promise to write them later.

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id             uuid primary key default gen_random_uuid(),
  bucket_id      text not null references storage.buckets(id),
  name           text not null,
  owner          uuid,
  metadata       jsonb,
  path_tokens    text[] generated always as (string_to_array(name, '/')) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  unique (bucket_id, name)
);

-- Supabase's helper: 'voice-notes/<user_id>/<uuid>.m4a' -> {voice-notes,<user_id>}
-- It drops the final segment (the filename), so element [1] is the first folder.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql immutable
as $$
declare
  parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[1 : array_length(parts, 1) - 1];
end $$;

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
