-- =============================================================================
-- Never remove the last active admin, even when two admins remove each other at once (ATS-33)
--
-- admin-manage-account used to count the active admins and then write the delete or the
-- demotion in a separate call. Two admins removing each other at the same moment could both
-- pass the count and leave no admin who can sign in.
--
-- This function does the check and the profile write in one transaction, under one lock for
-- every removal of access, so concurrent calls wait for each other and each one counts what the
-- previous one wrote. The Edge Function calls it before it bans the account or changes its role
-- in Auth, and undoes it if that Auth call fails.
--
-- change is 'soft_delete' (sets deleted_at) or 'demote' (makes the account a customer). The
-- refusals are codes (docs/error-codes.md): account_not_found, account_deleted, last_admin.
--
-- security definer, and only the service role may execute it (CLAUDE.md, security rule 2): the
-- Edge Function checks the caller with is_admin() and the caller's JWT before it gets here.
-- Backwards compatible: a new function that the code on main does not call.
-- =============================================================================
create or replace function public.soft_delete_or_demote_account(account_id uuid, change text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles;
begin
  if change not in ('soft_delete', 'demote') then
    raise exception 'invalid_input';
  end if;

  -- Held until the transaction ends. The statements below take their snapshot after the lock,
  -- so they see every removal that committed before.
  perform pg_advisory_xact_lock(hashtextextended('profiles.last_admin', 0));

  select * into target from public.profiles p where p.id = account_id;
  if target.id is null then
    raise exception 'account_not_found';
  end if;
  if target.deleted_at is not null then
    raise exception 'account_deleted';
  end if;

  if target.role = 'admin' and not exists (
    select 1 from public.profiles p
    where p.role = 'admin' and p.deleted_at is null and p.id <> account_id
  ) then
    raise exception 'last_admin';
  end if;

  if change = 'soft_delete' then
    update public.profiles p set deleted_at = now() where p.id = account_id;
  else
    update public.profiles p set role = 'customer' where p.id = account_id;
  end if;
end;
$$;

revoke execute on function public.soft_delete_or_demote_account(uuid, text)
  from public, anon, authenticated;
grant execute on function public.soft_delete_or_demote_account(uuid, text) to service_role;
