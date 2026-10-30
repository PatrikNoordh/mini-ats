-- =============================================================================
-- A role change in app_metadata never demotes the last active admin (ATS-35, AC5)
--
-- sync_role_from_app_metadata (ATS-28) copies app_metadata.role to the profile. admin-manage-
-- account demotes through soft_delete_or_demote_account first, under the last-admin lock
-- (ATS-33), so by the time it sets app_metadata the profile is already a customer. But any other
-- change of app_metadata.role, from the Supabase Dashboard, a script or a future function, went
-- straight to the profile and could demote the last admin.
--
-- Now a change to 'customer' takes the same lock and refuses with last_admin when it would
-- demote the last active admin. The exception rolls back the Auth update too, so app_metadata
-- and the profile stay in step. Demoting a deleted admin is allowed: it doesn't count as active.
--
-- Backwards compatible: the Edge Function's own flow never reaches the refusal, because the
-- profile is a customer before app_metadata changes.
-- =============================================================================

create or replace function public.sync_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data ->> 'role' not in ('admin', 'customer') then
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
