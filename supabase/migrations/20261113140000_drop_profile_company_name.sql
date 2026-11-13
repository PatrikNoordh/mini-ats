-- =============================================================================
-- profiles.company_name is dropped (ATS-61, AC11)
--
-- A company's name lives on the company since ATS-44, the app reads it from companies.name since
-- ATS-45, and an admin renames a company on the company since ATS-46. The column only remained
-- for the code on main of those tickets:
--   * handle_new_user copied it from user_metadata, which admin-create-user filled;
--   * profiles_sync_company renamed the company whose id was the profile's, which no company is
--     since the login swap, and none can be since ATS-61 AC2.
-- Both stop using it here, and the column goes. The rule that an account promoted to admin leaves
-- its company stays.
--
-- Backwards compatible like ATS-42: the code stops using the column before this migration drops
-- it. The app on main never reads or writes it. Deploy order: admin-create-user and
-- admin-manage-account from this branch, which no longer write it, are deployed before db push.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A new user's profile gets the name, the role and the email, as before, and no company name
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_app_meta_data ->> 'role', 'customer'),
    new.raw_user_meta_data ->> 'full_name',
    new.email
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. An account promoted to admin leaves its company, which keeps its data. Nothing else follows
--    the profile any more.
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
  return new;
end;
$$;

drop trigger profiles_sync_company on public.profiles;
create trigger profiles_sync_company
  after update of role on public.profiles
  for each row execute function public.sync_company_from_profile();

-- -----------------------------------------------------------------------------
-- 3. The column
-- -----------------------------------------------------------------------------
alter table public.profiles drop column company_name;
