-- =============================================================================
-- Companies are deleted and purged on their own (ATS-46)
--
-- Since ATS-44 a company's data outlives any one user. This migration finishes the move of the
-- 30-day delete from accounts to companies:
--   * companies_due_for_purge() lists the companies deleted more than 30 days ago, for the
--     nightly purge (purge-deleted-accounts), which removes their CV folder, their members'
--     logins and then the company with all its data.
--   * Deleting or restoring a user no longer deletes or restores a company. Until now the first
--     user's profile did, for a company with that user's id, so the accounts page of main could
--     delete a customer; admin-manage-company deletes and restores companies now. The name sync
--     and the rule that an admin is never a member stay.
--   * accounts_due_for_purge() no longer skips a user whose id is a company's. The skip kept the
--     purge deployed before ATS-44 from removing the company's CV folder with the user; the purge
--     deployed since removes only the login, so a deleted first user is purged like any other.
--
-- Backwards compatible with main (ATS-45) and with the functions deployed from it: they never
-- call companies_due_for_purge(), and their purge removes only logins. A company deleted with
-- its first user before this migration stays deleted, and the company purge removes it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The companies due for the purge
-- -----------------------------------------------------------------------------
create or replace function public.companies_due_for_purge()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from public.companies c
  where c.deleted_at is not null and c.deleted_at < now() - interval '30 days';
$$;

revoke execute on function public.companies_due_for_purge() from public, anon, authenticated;
grant execute on function public.companies_due_for_purge() to service_role;

-- -----------------------------------------------------------------------------
-- 2. A user's delete never reaches the company
-- -----------------------------------------------------------------------------
create or replace function public.sync_company_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' then
    delete from public.company_members m where m.user_id = new.id;
  end if;

  -- Only what changed, so a role change never undoes a company's own name. A blank company_name
  -- keeps the company's name: a company always has one. Goes when company_name is dropped.
  if new.company_name is distinct from old.company_name and nullif(btrim(new.company_name), '') is not null then
    update public.companies c set name = btrim(new.company_name) where c.id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_company on public.profiles;
create trigger profiles_sync_company
  after update of role, company_name on public.profiles
  for each row execute function public.sync_company_from_profile();

-- -----------------------------------------------------------------------------
-- 3. Every deleted account is purged after 30 days
-- -----------------------------------------------------------------------------
create or replace function public.accounts_due_for_purge()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p
  where p.deleted_at is not null and p.deleted_at < now() - interval '30 days';
$$;

revoke execute on function public.accounts_due_for_purge() from public, anon, authenticated;
grant execute on function public.accounts_due_for_purge() to service_role;
