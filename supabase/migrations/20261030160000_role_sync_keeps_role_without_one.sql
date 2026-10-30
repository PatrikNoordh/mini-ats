-- =============================================================================
-- An account without a role in app_metadata keeps its profile's role again (ATS-35, PR #96)
--
-- 20261030140000_role_sync_last_admin_lock turned the guard of sync_role_from_app_metadata
-- around to "role not in ('admin', 'customer')". For an app_metadata without a role that is
-- null, not true, so the function went on and set profiles.role to null. The not-null
-- constraint then refused it, and with it the whole Auth update: removing the role from an
-- account in the Dashboard failed instead of keeping the role, as ATS-28 intended.
--
-- Same function, with a missing role treated as an invalid one.
--
-- Backwards compatible: only the case that failed changes; it now keeps the profile's role.
-- =============================================================================

create or replace function public.sync_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'role', '') not in ('admin', 'customer') then
    return new;
  end if;

  if new.raw_app_meta_data ->> 'role' = 'customer' then
    -- The lock every removal of admin access takes, so this waits for them and they for it.
    perform pg_advisory_xact_lock(hashtextextended('profiles.last_admin', 0));
    if exists (
      select 1 from public.profiles p
      where p.id = new.id and p.role = 'admin' and p.deleted_at is null
    ) and not exists (
      select 1 from public.profiles p
      where p.role = 'admin' and p.deleted_at is null and p.id <> new.id
    ) then
      raise exception 'last_admin';
    end if;
  end if;

  update public.profiles
  set role = new.raw_app_meta_data ->> 'role'
  where id = new.id and role is distinct from new.raw_app_meta_data ->> 'role';
  return new;
end;
$$;
