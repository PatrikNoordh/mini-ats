-- =============================================================================
-- Deleted accounts are kept for 30 days before they are deleted for good (ATS-27)
--
-- An admin deleting an account on Konton only sets profiles.deleted_at. The account is hidden,
-- its login is blocked (a ban in Auth, set by the admin-manage-account Edge Function) and all its
-- data stays, so the admin can restore it. After ACCOUNT_DELETE_GRACE_DAYS (30, the same as in
-- src/lib/constants.ts: change both together) a daily job deletes the Auth user, and the
-- cascades remove the profile and everything in it.
--
-- A deleted account must get nothing, even with an access token it still holds:
--   * is_admin() is false for a deleted admin.
--   * account_is_active() gates every row a customer reads or writes as its own, and its own
--     profile, so the app finds no profile and signs it out.
-- Admins still read deleted accounts and their data (Borttagna konton, and restoring).
--
-- Backwards compatible: deleted_at is nullable, and no account is deleted until the app or the
-- function sets it.
-- =============================================================================

alter table public.profiles add column if not exists deleted_at timestamptz;

-- Is the signed-in account not deleted? security definer like is_admin(), so it reads profiles
-- without going through RLS.
create or replace function public.account_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and deleted_at is null
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and deleted_at is null
  );
$$;

-- The same policies as before, with the customer's own rows gated on an active account.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    (id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin())
  );

drop policy if exists "jobs_owner_or_admin" on public.jobs;
create policy "jobs_owner_or_admin" on public.jobs
  for all
  using ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()))
  with check ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()));

drop policy if exists "candidates_owner_or_admin" on public.candidates;
create policy "candidates_owner_or_admin" on public.candidates
  for all
  using ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()))
  with check ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()));

drop policy if exists "applications_owner_or_admin" on public.applications;
create policy "applications_owner_or_admin" on public.applications
  for all
  using ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()))
  with check ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()));

drop policy if exists "cv_assessments_select" on public.cv_assessments;
create policy "cv_assessments_select" on public.cv_assessments
  for select using (
    (customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin())
  );

drop policy if exists "cvs_owner_or_admin_read" on storage.objects;
create policy "cvs_owner_or_admin_read" on storage.objects
  for select using (
    bucket_id = 'cvs'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()))
      or (select public.is_admin())
    )
  );

drop policy if exists "cvs_owner_or_admin_write" on storage.objects;
create policy "cvs_owner_or_admin_write" on storage.objects
  for insert with check (
    bucket_id = 'cvs'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()))
      or (select public.is_admin())
    )
  );

drop policy if exists "cvs_owner_or_admin_delete" on storage.objects;
create policy "cvs_owner_or_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'cvs'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()))
      or (select public.is_admin())
    )
  );

-- Deletes the accounts deleted more than 30 days ago, for good. Deleting the Auth user cascades
-- to the profile, its jobs, candidates, cards and assessments (RLS check 19). Returns how many.
create or replace function public.purge_deleted_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  delete from auth.users
  where id in (
    select id from public.profiles
    where deleted_at is not null and deleted_at < now() - interval '30 days'
  );
  get diagnostics purged = row_count;
  return purged;
end;
$$;

-- Only the scheduled job (as postgres) runs it, never a client.
revoke execute on function public.purge_deleted_accounts() from public, anon, authenticated;

-- Once a day, at a quiet hour. pg_cron exists on Supabase; a plain Postgres (CI) has no pg_cron,
-- so the schedule is skipped there and the RLS tests call the function directly.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-deleted-accounts', '17 3 * * *', 'select public.purge_deleted_accounts()');
  end if;
end $$;
