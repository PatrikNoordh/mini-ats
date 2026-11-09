-- =============================================================================
-- Companies and memberships (ATS-44, step 1 of docs/next-teams.md)
--
-- customer_id was the customer's own user id. It is now a company id, in a new companies table,
-- so several users can share one company's jobs, candidates, board and CVs (epic 9). Nothing the
-- app shows changes yet: the app moves over in ATS-45.
--
--   * companies holds the companies, company_members says which company a user belongs to: one
--     at most (unique user_id). Clients only read them. Admins write them through the admin Edge
--     Functions (ATS-46), with the service role, and an admin is never a member.
--   * Each existing customer's company gets the customer's profile id, company_name and
--     deleted_at, and the profile becomes its member. Every company created later gets a new id.
--   * Every customer_id foreign key moves from profiles to companies, still on delete cascade.
--     No customer table, and not companies, references profiles or auth.users any more, so
--     deleting a user can never cascade to company data.
--   * RLS asks current_company_id() instead of auth.uid(), also the four cvs storage policies.
--   * The six default columns come with a new company, not a new user. The admins' are removed.
--   * A row's owner never changes once written (AC12): an update that changes customer_id on
--     jobs or candidates is refused, also for an admin and the service role.
--   * accounts_due_for_purge skips every user whose id is a company id, so no purge, not even
--     the one deployed from main, removes a company's CV folder with a user.
--
-- Backwards compatible with the code on main: each customer's first user is a member of a
-- company with their own id, so every customer_id = <profile id> the app sends still matches.
-- profiles.company_name stays, because main reads and writes it, and a trigger keeps the
-- company's name and deleted_at in step with its first user's profile until a later ticket drops
-- the column. Between this and ATS-46 an account created on main has no company, so it sees
-- nothing; no customer accounts are created in that window.
--
-- Deploy order: the changed purge-deleted-accounts and admin-manage-account, which never remove
-- a CV folder for a user, are deployed before db push, and again from main if this PR is closed
-- without merging. If it is, a new migration reverts this one.
--
-- Error codes (docs/error-codes.md): admin_cannot_be_member. An update that changes a row's
-- owner is refused with 42501 (insufficient_privilege), like a column the grants leave out.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. The check runs first, and stops with a clear message, changing nothing
--
-- Only customers own data. A job, candidate, card or assessment owned by an admin would have no
-- company to move to. The admins' columns are not checked: they are removed in section 4, and no
-- card can point at them, since no card belongs to an admin. A customer's company also needs a
-- name, which comes from company_name.
-- -----------------------------------------------------------------------------
do $$ declare not_customers text; no_name integer; begin
  select string_agg(format('%s (%s rows)', tbl, n), ', ') into not_customers
  from (
    select 'jobs' as tbl, count(*) as n
    from public.jobs t join public.profiles p on p.id = t.customer_id where p.role <> 'customer'
    union all select 'candidates', count(*)
    from public.candidates t join public.profiles p on p.id = t.customer_id where p.role <> 'customer'
    union all select 'applications', count(*)
    from public.applications t join public.profiles p on p.id = t.customer_id where p.role <> 'customer'
    union all select 'cv_assessments', count(*)
    from public.cv_assessments t join public.profiles p on p.id = t.customer_id where p.role <> 'customer'
  ) counts
  where n > 0;
  if not_customers is not null then
    raise exception 'ATS-44: rows belong to an account that is not a customer: %. Nothing was changed.',
      not_customers;
  end if;

  select count(*) into no_name from public.profiles p
  where p.role = 'customer'
    and (p.company_name is null or btrim(p.company_name) = '' or char_length(p.company_name) > 200);
  if no_name > 0 then
    raise exception 'ATS-44: % customer accounts have no company_name, or one over 200 characters. Nothing was changed.',
      no_name;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. The tables
--
-- companies has no foreign key to profiles or auth.users, even where the ids match: a company
-- outlives any one of its users. The name has the same limit as a company name on an account,
-- MAX_NAME_LENGTH (200) in src/lib/constants.ts and admin-create-user: change them together.
-- -----------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint companies_name_length check (char_length(name) <= 200),
  constraint companies_name_not_blank check (btrim(name) <> '')
);

-- Deleting a user removes their membership and nothing else. Deleting a company removes its
-- memberships, and its users stay, without a company.
create table public.company_members (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id),
  -- One company per user. Several companies per user later means dropping this and adding a
  -- chooser, not a new table.
  constraint company_members_user_id_key unique (user_id)
);

-- -----------------------------------------------------------------------------
-- 2. Every customer's company, under the customer's own id, and its first member
-- -----------------------------------------------------------------------------
insert into public.companies (id, name, created_at, deleted_at)
select p.id, btrim(p.company_name), p.created_at, p.deleted_at
from public.profiles p
where p.role = 'customer';

insert into public.company_members (company_id, user_id, created_at)
select p.id, p.id, p.created_at
from public.profiles p
where p.role = 'customer';

-- -----------------------------------------------------------------------------
-- 3. The kind rules skip an id that is not a company
--
-- They skipped a customer whose profile was gone, so an account delete could cascade. Now a
-- company delete cascades instead, and the admins' columns, which belong to no company, can be
-- removed below. Replaced before that removal: the old version would refuse removing an admin's
-- last hired column.
-- -----------------------------------------------------------------------------
create or replace function public.check_pipeline_stage_kinds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.companies c where c.id = old.customer_id) then
    return null;
  end if;
  if not exists (
    select 1 from public.pipeline_stages s where s.customer_id = old.customer_id and s.kind = 'hired'
  ) then
    raise exception 'stage_hired_required';
  end if;
  if not exists (
    select 1 from public.pipeline_stages s where s.customer_id = old.customer_id and s.kind = 'rejected'
  ) then
    raise exception 'stage_rejected_required';
  end if;
  if not exists (
    select 1 from public.pipeline_stages s where s.customer_id = old.customer_id and s.kind = 'open'
  ) then
    raise exception 'stage_open_required';
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Default columns per company, not per user
--
-- The admins' columns go: no card belongs to an admin (section 0), so no card points at them.
-- The trigger on companies is created after section 2, so the migrated companies, which kept
-- their customer's columns, get no second set.
-- -----------------------------------------------------------------------------
delete from public.pipeline_stages s
where not exists (select 1 from public.companies c where c.id = s.customer_id);

drop trigger if exists profiles_default_stages on public.profiles;
drop function if exists public.handle_new_profile_stages();

create or replace function public.handle_new_company_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_default_stages(new.id);
  return new;
end;
$$;

create trigger companies_default_stages
  after insert on public.companies
  for each row execute function public.handle_new_company_stages();

-- -----------------------------------------------------------------------------
-- 5. Every customer_id references companies, still on delete cascade
-- -----------------------------------------------------------------------------
alter table public.jobs
  drop constraint jobs_customer_id_fkey,
  add constraint jobs_customer_id_fkey
    foreign key (customer_id) references public.companies (id) on delete cascade;

alter table public.candidates
  drop constraint candidates_customer_id_fkey,
  add constraint candidates_customer_id_fkey
    foreign key (customer_id) references public.companies (id) on delete cascade;

alter table public.applications
  drop constraint applications_customer_id_fkey,
  add constraint applications_customer_id_fkey
    foreign key (customer_id) references public.companies (id) on delete cascade;

alter table public.cv_assessments
  drop constraint cv_assessments_customer_id_fkey,
  add constraint cv_assessments_customer_id_fkey
    foreign key (customer_id) references public.companies (id) on delete cascade;

alter table public.pipeline_stages
  drop constraint pipeline_stages_customer_id_fkey,
  add constraint pipeline_stages_customer_id_fkey
    foreign key (customer_id) references public.companies (id) on delete cascade;

-- -----------------------------------------------------------------------------
-- 6. The signed-in user's company
--
-- While the user is active and the company is too, otherwise null, so a deleted member and every
-- member of a deleted company get no rows. security definer like is_admin(), so it reads the
-- tables without going through RLS. Every client may run it, like is_admin(): the storage
-- policies run it for signed-out requests too, and for them it is null.
-- -----------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.company_id
  from public.company_members m
  join public.profiles p on p.id = m.user_id
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid() and p.deleted_at is null and c.deleted_at is null;
$$;

-- -----------------------------------------------------------------------------
-- 7. Row Level Security by company
--
-- The same shape as before, evaluated once per statement. account_is_active() stays for the
-- profile policy: current_company_id() already checks the user and the company.
-- -----------------------------------------------------------------------------
drop policy if exists "jobs_owner_or_admin" on public.jobs;
create policy "jobs_owner_or_admin" on public.jobs
  for all
  using (customer_id = (select public.current_company_id()) or (select public.is_admin()))
  with check (customer_id = (select public.current_company_id()) or (select public.is_admin()));

drop policy if exists "candidates_owner_or_admin" on public.candidates;
create policy "candidates_owner_or_admin" on public.candidates
  for all
  using (customer_id = (select public.current_company_id()) or (select public.is_admin()))
  with check (customer_id = (select public.current_company_id()) or (select public.is_admin()));

drop policy if exists "applications_owner_or_admin" on public.applications;
create policy "applications_owner_or_admin" on public.applications
  for all
  using (customer_id = (select public.current_company_id()) or (select public.is_admin()))
  with check (customer_id = (select public.current_company_id()) or (select public.is_admin()));

drop policy if exists "cv_assessments_select" on public.cv_assessments;
create policy "cv_assessments_select" on public.cv_assessments
  for select using (customer_id = (select public.current_company_id()) or (select public.is_admin()));

drop policy if exists "cv_assessments_delete" on public.cv_assessments;
create policy "cv_assessments_delete" on public.cv_assessments
  for delete using (customer_id = (select public.current_company_id()) or (select public.is_admin()));

drop policy if exists "pipeline_stages_owner_or_admin" on public.pipeline_stages;
create policy "pipeline_stages_owner_or_admin" on public.pipeline_stages
  for all
  using (customer_id = (select public.current_company_id()) or (select public.is_admin()))
  with check (customer_id = (select public.current_company_id()) or (select public.is_admin()));

-- The CVs: the folder is the company id, so every member opens, uploads, replaces and removes
-- the company's CVs, and nobody else's.
drop policy if exists "cvs_owner_or_admin_read" on storage.objects;
create policy "cvs_owner_or_admin_read" on storage.objects
  for select using (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );

drop policy if exists "cvs_owner_or_admin_write" on storage.objects;
create policy "cvs_owner_or_admin_write" on storage.objects
  for insert with check (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );

drop policy if exists "cvs_owner_or_admin_update" on storage.objects;
create policy "cvs_owner_or_admin_update" on storage.objects
  for update
  using (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  )
  with check (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );

drop policy if exists "cvs_owner_or_admin_delete" on storage.objects;
create policy "cvs_owner_or_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );

-- The new tables: a member reads its own company and its memberships, an admin reads all.
-- Clients write neither (no grant): admins add, move and remove users and name companies through
-- the admin Edge Functions, with the service role (ATS-46, CLAUDE.md security rule 3).
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create policy "companies_member_or_admin" on public.companies
  for select using (id = (select public.current_company_id()) or (select public.is_admin()));

create policy "company_members_member_or_admin" on public.company_members
  for select using (company_id = (select public.current_company_id()) or (select public.is_admin()));

grant select on public.companies to authenticated;
grant select on public.company_members to authenticated;
grant all on public.companies to service_role;
grant all on public.company_members to service_role;

-- -----------------------------------------------------------------------------
-- 8. reset_stages checks the caller by company
--
-- The same function as in 20261102180000_stage_management, except the first check: the
-- caller's own company, or an admin, and a company that exists and is not deleted.
-- current_company_id() is null for a deleted member, so the comparison is wrapped in coalesce:
-- `not (null or false)` is null, and an if on null would let the caller through.
-- -----------------------------------------------------------------------------
create or replace function public.reset_stages(customer_id uuid)
returns setof public.pipeline_stages
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(reset_stages.customer_id = public.current_company_id(), false) or public.is_admin())
     or not exists (
       select 1 from public.companies c
       where c.id = reset_stages.customer_id and c.deleted_at is null
     ) then
    raise exception 'stage_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pipeline_stages:' || reset_stages.customer_id, 0));
  perform 1 from public.pipeline_stages s where s.customer_id = reset_stages.customer_id for update;
  perform pg_advisory_xact_lock(hashtextextended('pipeline_stages.kinds:' || reset_stages.customer_id, 0));

  set constraints pipeline_stages_kinds, pipeline_stages_position_key deferred;

  delete from public.pipeline_stages s
  where s.customer_id = reset_stages.customer_id and s.default_key is null;

  update public.pipeline_stages s
  set name = null, position = d.position, kind = d.kind, colour = d.colour
  from public.default_stage_specs() d
  where s.customer_id = reset_stages.customer_id and s.default_key = d.default_key;

  insert into public.pipeline_stages (customer_id, default_key, position, kind, colour)
  select reset_stages.customer_id, d.default_key, d.position, d.kind, d.colour
  from public.default_stage_specs() d
  where not exists (
    select 1 from public.pipeline_stages s
    where s.customer_id = reset_stages.customer_id and s.default_key = d.default_key
  );

  set constraints pipeline_stages_kinds, pipeline_stages_position_key immediate;

  return query
    select * from public.pipeline_stages s
    where s.customer_id = reset_stages.customer_id
    order by s.position;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. The card triggers run in a named order, and customer_id's placeholder is the nil UUID
--
-- Postgres fires triggers in name order. The start stage reads the customer_id the first trigger
-- set from the job, so the order is now in the names, like candidates_cv_uploaded_at_1_keep and
-- _2_stamp, and rls_test.sql fails if it changes. The default was auth.uid(), a placeholder the
-- trigger always replaces; for anyone but a migrated first user that is not a company id, so it
-- becomes the nil UUID, like stage_id's.
-- -----------------------------------------------------------------------------
alter trigger applications_set_customer on public.applications rename to applications_1_set_customer;
alter trigger applications_start_stage on public.applications rename to applications_2_start_stage;

alter table public.applications
  alter column customer_id set default '00000000-0000-0000-0000-000000000000'::uuid;

-- -----------------------------------------------------------------------------
-- 10. A row's owner never changes (AC12)
--
-- An admin could move a job to another customer while its cards kept the old one, so a card
-- pointed at another customer's job. A trigger rather than column grants, so it holds for the
-- service role too. Cards and assessments get customer_id from triggers (security rule 7), and
-- clients have no grant to change a column's customer_id.
-- -----------------------------------------------------------------------------
create or replace function public.keep_customer_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_id is distinct from old.customer_id then
    raise exception 'owner_change_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger jobs_keep_customer
  before update of customer_id on public.jobs
  for each row execute function public.keep_customer_id();

create trigger candidates_keep_customer
  before update of customer_id on public.candidates
  for each row execute function public.keep_customer_id();

-- -----------------------------------------------------------------------------
-- 11. Memberships and the first user's profile
--
-- An admin is never a member: a membership for an admin is refused, and an account promoted to
-- admin leaves its company, which keeps its data. The first user's profile is the customer on
-- the accounts page of main, so its company_name renames the company, and deleting or restoring
-- that account deletes or restores the company, until a later ticket drops company_name. A
-- company deleted that way stays for the company purge (ATS-46), with its data.
-- -----------------------------------------------------------------------------
create or replace function public.check_company_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin') then
    raise exception 'admin_cannot_be_member';
  end if;
  return new;
end;
$$;

create trigger company_members_check
  before insert or update on public.company_members
  for each row execute function public.check_company_member();

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

  -- Only what changed, so a role change never undoes a company's own name or delete. A blank
  -- company_name keeps the company's name: a company always has one.
  if new.company_name is distinct from old.company_name and nullif(btrim(new.company_name), '') is not null then
    update public.companies c set name = btrim(new.company_name) where c.id = new.id;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    update public.companies c set deleted_at = new.deleted_at where c.id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_company
  after update of role, company_name, deleted_at on public.profiles
  for each row execute function public.sync_company_from_profile();

-- -----------------------------------------------------------------------------
-- 12. The purge never removes a company's folder with a user
--
-- A migrated first user's id is their company's id, and so is their CV folder's name. The purge
-- deployed from main removes the folder named after each user it purges, so it must never get
-- such a user. Until the company purge (ATS-46) a deleted first user therefore stays past the
-- 30 days, and their company, deleted with them (section 11), is purged with its data then.
-- -----------------------------------------------------------------------------
create or replace function public.accounts_due_for_purge()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p
  where p.deleted_at is not null and p.deleted_at < now() - interval '30 days'
    and not exists (select 1 from public.companies c where c.id = p.id);
$$;
