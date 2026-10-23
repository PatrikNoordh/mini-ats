-- =============================================================================
-- Minimal stand-in for the Supabase parts the schema uses, so the migrations and
-- rls_test.sql can run against a plain Postgres (locally or in CI).
-- Do NOT run this in a real Supabase project.
-- =============================================================================
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists storage;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_app_meta_data   jsonb default '{}'::jsonb,
  raw_user_meta_data  jsonb default '{}'::jsonb
);

-- Same definition as Supabase's auth.uid()
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
-- owner as in Supabase, so a test variable named like a column fails here too, not only there.
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;  -- on by default in Supabase
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;

grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on storage.objects to authenticated, service_role;
-- No default table privileges: the migrations grant them explicitly (ATS-22), so CI tests the
-- same privileges as the project.
