-- =============================================================================
-- The login swap checks its safety rule in the database first (ATS-58)
--
-- scripts/swap-logins.ts replaces each migrated company's first login, whose id is the company's,
-- with a new account, and then deletes the old login. That delete must never reach company data,
-- so before it changes anything the script asks this function for every foreign key that would
-- let it: one from a customer table, or from companies, to profiles or auth.users. Only
-- profiles (to auth.users) and company_members (to profiles) may reference a user. The script
-- refuses with swap_blocked while the list is not empty.
--
-- Read only, and only the service role may run it. Backwards compatible: nothing on main calls it.
-- =============================================================================

create or replace function public.login_swap_blockers()
returns table (table_name text, constraint_name text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select c.conrelid::regclass::text, c.conname::text
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f'
    and n.nspname = 'public'
    and c.conrelid not in ('public.profiles'::regclass, 'public.company_members'::regclass)
    and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
  order by 1, 2;
$$;

revoke execute on function public.login_swap_blockers() from public, anon, authenticated;
grant execute on function public.login_swap_blockers() to service_role;
