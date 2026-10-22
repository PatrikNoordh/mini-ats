-- =============================================================================
-- Give accounts created as admin the admin role (ATS-28)
--
-- Auth's admin API inserts a new user first and sets app_metadata in a later update.
-- handle_new_user runs on the insert, finds no role yet and falls back to 'customer', so every
-- admin created on Konton (admin-create-user) or by the seed script became a customer.
--
-- This trigger copies the role when Auth sets or changes app_metadata.role. It only fires when
-- that role changes, and only copies 'admin' or 'customer', so Auth's own provider keys and any
-- other value leave profiles.role alone. app_metadata can only be written by the server, and
-- profiles.role stays the role that RLS and the app read (CLAUDE.md, security rule 4).
-- =============================================================================

create or replace function public.sync_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data ->> 'role' in ('admin', 'customer') then
    update public.profiles
    set role = new.raw_app_meta_data ->> 'role'
    where id = new.id and role is distinct from new.raw_app_meta_data ->> 'role';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_role_changed on auth.users;
create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data ->> 'role' is distinct from old.raw_app_meta_data ->> 'role')
  execute function public.sync_role_from_app_metadata();

-- The accounts already created wrong. An account without a valid role in app_metadata keeps
-- the role its profile has.
update public.profiles p
set role = u.raw_app_meta_data ->> 'role'
from auth.users u
where u.id = p.id
  and u.raw_app_meta_data ->> 'role' in ('admin', 'customer')
  and p.role is distinct from u.raw_app_meta_data ->> 'role';
