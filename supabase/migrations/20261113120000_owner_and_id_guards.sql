-- =============================================================================
-- A row's owner and an id's meaning never change (ATS-61, AC1 and AC2)
--
--   * A card's and an assessment's customer_id is locked once written, like a job's and a
--     candidate's since ATS-44 (AC12 there). Section 10 of 20261109120000_companies.sql says
--     "clients have no grant to change a column's customer_id". That was not true:
--     authenticated has an update grant on every column of applications, and the trigger that
--     sets customer_id from the job only fires when job_id or candidate_id change. So an admin, or
--     the service role, could move a card to another company together with one of its columns,
--     while its job and candidate stayed behind. The lock is a trigger, so it holds for every
--     role, and it fires on every update, after the triggers that set customer_id. A job or
--     candidate change that would move the card to another company is refused too.
--   * One id, one meaning. A company migrated in ATS-44 kept its first user's id, so one id named
--     a login, a profile, a company and a CV folder until the login swap (ATS-58) gave those users
--     new logins. The swap ran once on the project and is retired in ATS-61. Now a company whose
--     id is an account's is refused, and so is an account whose id is a company's.
--
-- Backwards compatible with the code on main: no app path changes a card's or an assessment's
-- customer_id, and every company and account gets a random id.
--
-- Error codes (docs/error-codes.md): owner_change_not_allowed (42501), as for jobs and
-- candidates, and id_shared (23505). No app path reaches either.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. The check runs first, and stops with a clear message, changing nothing
-- -----------------------------------------------------------------------------
do $$ declare shared integer; begin
  select count(*) into shared
  from public.companies c
  where exists (select 1 from public.profiles p where p.id = c.id)
     or exists (select 1 from auth.users u where u.id = c.id);
  if shared > 0 then
    raise exception 'ATS-61: % companies share their id with an account. Nothing was changed.', shared;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. A card's and an assessment's owner never changes (AC1)
--
-- Before-update triggers fire in name order, so the lock is named to run after the trigger that
-- sets customer_id: applications_3_keep_customer after applications_1_set_customer, and
-- cv_assessments_2_keep_customer after cv_assessments_1_set_customer, renamed here for the order.
-- keep_customer_id() is the function jobs and candidates use.
-- -----------------------------------------------------------------------------
create trigger applications_3_keep_customer
  before update on public.applications
  for each row execute function public.keep_customer_id();

alter trigger cv_assessments_set_customer on public.cv_assessments rename to cv_assessments_1_set_customer;

create trigger cv_assessments_2_keep_customer
  before update on public.cv_assessments
  for each row execute function public.keep_customer_id();

-- -----------------------------------------------------------------------------
-- 2. No company and no account share an id (AC2)
--
-- Each side checks the other, under a lock on the id, so two writes of the same id at the same
-- time wait for each other and the second sees the first. An account is checked in profiles,
-- which the Auth trigger fills for every new user, and a company in auth.users too, for a user
-- whose profile is not written yet. security definer, so it reads both past RLS.
-- -----------------------------------------------------------------------------
create or replace function public.check_id_not_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('id_meaning:' || new.id, 0));
  if tg_table_name = 'companies' then
    if exists (select 1 from public.profiles p where p.id = new.id)
       or exists (select 1 from auth.users u where u.id = new.id) then
      raise exception 'id_shared' using errcode = 'unique_violation';
    end if;
  elsif exists (select 1 from public.companies c where c.id = new.id) then
    raise exception 'id_shared' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger companies_id_not_shared
  before insert or update of id on public.companies
  for each row execute function public.check_id_not_shared();

create trigger profiles_id_not_shared
  before insert or update of id on public.profiles
  for each row execute function public.check_id_not_shared();
