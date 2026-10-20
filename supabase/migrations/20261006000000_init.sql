-- =============================================================================
-- Mini-ATS — initial schema and security rules (Supabase / Postgres)
--
-- Principles:
--   * Every customer sees only their own rows. Admins can see and change everything.
--   * The role is set in app_metadata at account creation, which only the server can do,
--     and copied to profiles.role. RLS reads profiles.role through public.is_admin().
--     Users cannot make themselves admin.
--   * Public sign-up is disabled in Supabase (Authentication → Sign In / Providers).
--     Accounts are only created by an admin, through an Edge Function with the service role key.
--   * customer_id on applications and cv_assessments is set by triggers, never trusted from the client.
--   * cv_assessments is read-only for clients. Only the assess-cv Edge Function writes to it.
--   * Trigger errors are codes (docs/error-codes.md), never user-facing text. The UI translates them.
--
-- Tests: supabase/tests/rls_test.sql (13 checks, runs in one transaction and rolls back).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profiles — one row per user, created automatically when an account is created
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          text not null default 'customer' check (role in ('admin', 'customer')),
  full_name     text,
  company_name  text,
  email         text,               -- copied from auth.users when the account is created
  created_at    timestamptz not null default now()
);

-- Is the signed-in user an admin?
-- security definer so it can read profiles without going through RLS (avoids recursion).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Create a profile when an account is created. The role comes from app_metadata (server only),
-- name and company from user_metadata, email from auth.users.
-- Note: an account created in the Supabase dashboard has no role in app_metadata at insert,
-- so its profile becomes 'customer'. Promote the first admin with:
--   update public.profiles set role = 'admin' where email = '<email>';
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, company_name, email)
  values (
    new.id,
    coalesce(new.raw_app_meta_data ->> 'role', 'customer'),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name',
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Jobs — positions the customer is recruiting for
-- -----------------------------------------------------------------------------
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  description  text,
  location     text,
  status       text not null default 'open' check (status in ('open', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Candidates — people, with profile information
-- -----------------------------------------------------------------------------
create table if not exists public.candidates (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles (id) on delete cascade,
  full_name     text not null,
  email         text,
  phone         text,
  linkedin_url  text check (linkedin_url is null or linkedin_url ~* '^https?://([a-z]+\.)?linkedin\.com/'),
  notes         text,
  cv_path       text,               -- path in the "cvs" storage bucket
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The CV must be in the candidate's own customer folder. Otherwise a customer could point at
  -- another customer's file and have an Edge Function read it.
  constraint candidates_cv_path_own_folder
    check (cv_path is null or split_part(cv_path, '/', 1) = customer_id::text)
);

-- -----------------------------------------------------------------------------
-- 4. Applications — link a candidate to a job; one card on the kanban board
-- -----------------------------------------------------------------------------
create table if not exists public.applications (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.profiles (id) on delete cascade,
  job_id            uuid not null references public.jobs (id) on delete cascade,
  candidate_id      uuid not null references public.candidates (id) on delete cascade,
  stage             text not null default 'new'
                    check (stage in ('new', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  position          integer not null default 0,              -- order within a column
  stage_changed_at  timestamptz not null default now(),      -- for "days in stage"
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (job_id, candidate_id)
);

-- Job and candidate must belong to the same customer. Sets customer_id from the job.
create or replace function public.set_application_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_customer        uuid;
  candidate_customer  uuid;
begin
  select customer_id into job_customer from public.jobs where id = new.job_id;
  select customer_id into candidate_customer from public.candidates where id = new.candidate_id;

  if job_customer is null or candidate_customer is null or job_customer <> candidate_customer then
    raise exception 'job_candidate_customer_mismatch';
  end if;

  new.customer_id := job_customer;
  return new;
end;
$$;

drop trigger if exists applications_set_customer on public.applications;
create trigger applications_set_customer
  before insert or update of job_id, candidate_id on public.applications
  for each row execute function public.set_application_customer();

-- -----------------------------------------------------------------------------
-- 5. (Extra) AI assessment of a CV — a suggestion for the recruiter, never a decision
-- -----------------------------------------------------------------------------
create table if not exists public.cv_assessments (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.profiles (id) on delete cascade,
  application_id  uuid not null references public.applications (id) on delete cascade,
  score           integer check (score between 1 and 10),
  summary         text,
  strengths       jsonb not null default '[]'::jsonb,
  gaps            jsonb not null default '[]'::jsonb,
  model           text,
  created_at      timestamptz not null default now()
);

-- customer_id always comes from the application, never from the writer.
create or replace function public.set_assessment_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select customer_id into new.customer_id from public.applications where id = new.application_id;
  if new.customer_id is null then
    raise exception 'application_not_found';
  end if;
  return new;
end;
$$;

drop trigger if exists cv_assessments_set_customer on public.cv_assessments;
create trigger cv_assessments_set_customer
  before insert or update of application_id on public.cv_assessments
  for each row execute function public.set_assessment_customer();

-- -----------------------------------------------------------------------------
-- 6. updated_at and stage_changed_at are set automatically
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

drop trigger if exists candidates_touch on public.candidates;
create trigger candidates_touch before update on public.candidates
  for each row execute function public.touch_updated_at();

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

-- stage_changed_at only changes when the stage changes, not when a card moves within a column.
create or replace function public.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists applications_stage_changed on public.applications;
create trigger applications_stage_changed before update of stage on public.applications
  for each row execute function public.touch_stage_changed_at();

-- -----------------------------------------------------------------------------
-- 7. Indexes for filtering, the board and foreign keys
-- -----------------------------------------------------------------------------
create index if not exists jobs_customer_idx          on public.jobs (customer_id);
create index if not exists candidates_customer_idx    on public.candidates (customer_id);
create index if not exists applications_customer_idx  on public.applications (customer_id);
create index if not exists applications_job_idx       on public.applications (job_id);
create index if not exists applications_stage_idx     on public.applications (customer_id, stage, position);
create index if not exists applications_candidate_idx on public.applications (candidate_id);
create index if not exists cv_assessments_app_idx     on public.cv_assessments (application_id);
create index if not exists cv_assessments_customer_idx on public.cv_assessments (customer_id);

-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.jobs            enable row level security;
alter table public.candidates      enable row level security;
alter table public.applications    enable row level security;
alter table public.cv_assessments  enable row level security;

-- Profiles: users see their own, admins see all. Only admins can update, so nobody can change their own role.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

-- Jobs, candidates and applications: the customer owns its rows, admins can do everything.
drop policy if exists "jobs_owner_or_admin" on public.jobs;
create policy "jobs_owner_or_admin" on public.jobs
  for all using (customer_id = (select auth.uid()) or (select public.is_admin()))
  with check (customer_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "candidates_owner_or_admin" on public.candidates;
create policy "candidates_owner_or_admin" on public.candidates
  for all using (customer_id = (select auth.uid()) or (select public.is_admin()))
  with check (customer_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "applications_owner_or_admin" on public.applications;
create policy "applications_owner_or_admin" on public.applications
  for all using (customer_id = (select auth.uid()) or (select public.is_admin()))
  with check (customer_id = (select auth.uid()) or (select public.is_admin()));

-- AI assessments: read-only for clients. The assess-cv Edge Function writes with the service role,
-- so nobody can forge an assessment.
drop policy if exists "cv_assessments_owner_or_admin" on public.cv_assessments;
drop policy if exists "cv_assessments_select" on public.cv_assessments;
create policy "cv_assessments_select" on public.cv_assessments
  for select using (customer_id = (select auth.uid()) or (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 9. Storage for CVs (private bucket). Files live under <customer_id>/<file name>.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

drop policy if exists "cvs_owner_or_admin_read" on storage.objects;
create policy "cvs_owner_or_admin_read" on storage.objects
  for select using (
    bucket_id = 'cvs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

drop policy if exists "cvs_owner_or_admin_write" on storage.objects;
create policy "cvs_owner_or_admin_write" on storage.objects
  for insert with check (
    bucket_id = 'cvs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

drop policy if exists "cvs_owner_or_admin_delete" on storage.objects;
create policy "cvs_owner_or_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'cvs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );
