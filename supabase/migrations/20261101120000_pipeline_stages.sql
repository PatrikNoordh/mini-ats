-- =============================================================================
-- Pipeline stages per customer (ATS-38)
--
-- The board's six stages were a fixed check on applications.stage. They now live in a table, one
-- set per account, so a later ticket can let a customer rename, add, remove and reorder them.
-- Design: docs/next-custom-stages.md. Nothing the app shows changes.
--
--   * pipeline_stages holds the columns. An unrenamed default has name null and a default_key
--     the app translates. kind says what a column means: open, hired or rejected.
--   * applications.stage_id points at a column of the card's own customer. The foreign key is on
--     (stage_id, customer_id), so a card can never point at another customer's column, and a
--     column that still has cards cannot be deleted.
--   * Every account has exactly one hired column and at least one rejected column, and at most
--     MAX_PIPELINE_STAGES (10) columns.
--   * One advisory lock per customer covers every write to its columns and every card move, so
--     two tabs cannot interleave a reorder, a removal or a move.
--
-- Limits held here, and in src/lib/constants.ts once the app checks them (epic 8). Change both
-- together:
--
--   pipeline_stages per customer  10   MAX_PIPELINE_STAGES
--   pipeline_stages.name          50   MAX_STAGE_NAME_LENGTH
--
-- Error codes (docs/error-codes.md): stage_not_found, stage_hired_required,
-- stage_rejected_required, stage_limit_reached. Deleting a column with cards is refused with
-- 23503 (foreign_key_violation), like deleting a job with candidates.
--
-- Backwards compatible with the code on main and with v1.0-submission, which only know
-- applications.stage: that column stays, with its check, and a trigger keeps it and stage_id in
-- step both ways. move_application(uuid, uuid, text) still works, through the new function.
-- ATS-42 drops stage once no deployed code reads it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The table
-- -----------------------------------------------------------------------------
create table public.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  name         text,                -- null for an unrenamed default, which the app translates
  default_key  text check (default_key in ('new', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  position     integer not null check (position >= 0),
  kind         text not null default 'open' check (kind in ('open', 'hired', 'rejected')),
  colour       text not null check (colour in ('grey', 'blue', 'teal', 'violet', 'pink', 'amber', 'green', 'red')),
  created_at   timestamptz not null default now(),
  -- The target of the applications foreign key, so a card's column is always its customer's.
  constraint pipeline_stages_id_customer_key unique (id, customer_id),
  -- Deferrable so reorder_stages can swap positions in one statement: the check runs once the
  -- statement is done, not row by row.
  constraint pipeline_stages_position_key unique (customer_id, position) deferrable initially immediate,
  constraint pipeline_stages_default_key_key unique (customer_id, default_key),
  constraint pipeline_stages_has_name check (name is not null or default_key is not null),
  constraint pipeline_stages_name_length check (char_length(name) <= 50),
  constraint pipeline_stages_name_not_blank check (btrim(name) <> '')
);

-- Names are unique per customer, whatever the case or surrounding spaces.
create unique index pipeline_stages_name_key
  on public.pipeline_stages (customer_id, lower(btrim(name))) where name is not null;

-- At most one hired column per customer. "At least one" is the trigger in section 3.
create unique index pipeline_stages_one_hired
  on public.pipeline_stages (customer_id) where kind = 'hired';

-- -----------------------------------------------------------------------------
-- 2. Every write to a customer's columns takes the customer's lock, and at most 10 columns
--
-- The lock is taken before the row is written, so a removal and a card move into the same column
-- wait for each other instead of deadlocking on the row and the lock. Held until the transaction
-- ends, and the statements after it take their snapshot later, so they see what committed before.
-- -----------------------------------------------------------------------------
create or replace function public.pipeline_stages_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer uuid := case when tg_op = 'DELETE' then old.customer_id else new.customer_id end;
begin
  perform pg_advisory_xact_lock(hashtextextended('pipeline_stages:' || customer, 0));

  if tg_op = 'INSERT'
     and (select count(*) from public.pipeline_stages s where s.customer_id = customer) >= 10 then
    raise exception 'stage_limit_reached';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger pipeline_stages_before_write
  before insert or update or delete on public.pipeline_stages
  for each row execute function public.pipeline_stages_before_write();

-- -----------------------------------------------------------------------------
-- 3. Exactly one hired and at least one rejected column, so the Hired prompt always has both
--
-- Checked once the statement is done, on the state it leaves. Deferrable, so a future reset can
-- replace every column in one transaction. An account being deleted takes its columns with it,
-- so the check is skipped when the profile is gone.
-- -----------------------------------------------------------------------------
create or replace function public.check_pipeline_stage_kinds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = old.customer_id) then
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
  return null;
end;
$$;

create constraint trigger pipeline_stages_kinds
  after update of kind or delete on public.pipeline_stages
  deferrable initially immediate
  for each row execute function public.check_pipeline_stage_kinds();

-- -----------------------------------------------------------------------------
-- 4. The six default columns, for every account that exists and every new one
--
-- Every account gets them, admins too, so an admin later made a customer has a board.
-- -----------------------------------------------------------------------------
create or replace function public.create_default_stages(customer uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pipeline_stages (customer_id, default_key, position, kind, colour)
  values
    (customer, 'new',       0, 'open',     'grey'),
    (customer, 'screening', 1, 'open',     'blue'),
    (customer, 'interview', 2, 'open',     'violet'),
    (customer, 'offer',     3, 'open',     'amber'),
    (customer, 'hired',     4, 'hired',    'green'),
    (customer, 'rejected',  5, 'rejected', 'red');
$$;

revoke execute on function public.create_default_stages(uuid) from public, anon, authenticated;

create or replace function public.handle_new_profile_stages()
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

create trigger profiles_default_stages
  after insert on public.profiles
  for each row execute function public.handle_new_profile_stages();

do $$ begin
  perform public.create_default_stages(p.id) from public.profiles p;
end $$;

-- -----------------------------------------------------------------------------
-- 5. applications.stage_id, filled for every card that exists
-- -----------------------------------------------------------------------------
alter table public.applications add column stage_id uuid;

-- The backfill is not an edit of the cards, so it leaves updated_at as it was.
alter table public.applications disable trigger applications_touch;
update public.applications a
set stage_id = s.id
from public.pipeline_stages s
where s.customer_id = a.customer_id and s.default_key = a.stage;
alter table public.applications enable trigger applications_touch;

-- Every card has a column. A check rather than `not null`: the trigger in section 6 fills stage_id,
-- and a not-null column without a default would be required in the generated Insert type, which
-- the code on main does not send. ATS-42 makes it `not null` when it drops stage.
alter table public.applications
  add constraint applications_stage_id_set check (stage_id is not null),
  add constraint applications_stage_id_fkey
    foreign key (stage_id, customer_id) references public.pipeline_stages (id, customer_id)
    -- `no action` rather than `restrict`: both refuse removing a column that has cards, but
    -- `no action` checks at the end of the statement. Deleting an account cascades from profiles
    -- to both its columns and its cards in one statement, and must work in either order
    -- (the same reason as applications_job_id_fkey, ATS-26).
    on delete no action;

-- The board reads a column's cards in order, and the foreign key checks a removed column here.
create index applications_stage_id_idx on public.applications (customer_id, stage_id, position);

-- -----------------------------------------------------------------------------
-- 6. stage and stage_id stay in step both ways
--
-- The column a stage name means for a customer: its default column with that key, or for hired
-- and rejected the first column of that kind, if the default one was removed. security invoker:
-- a caller only finds columns RLS lets it see.
-- -----------------------------------------------------------------------------
create or replace function public.stage_id_for_key(customer uuid, key text)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select s.id from public.pipeline_stages s
  where s.customer_id = customer
    and (s.default_key = key or (key in ('hired', 'rejected') and s.kind = key))
  order by s.default_key = key desc, s.position
  limit 1;
$$;

revoke execute on function public.stage_id_for_key(uuid, text) from public, anon;
grant execute on function public.stage_id_for_key(uuid, text) to authenticated;

-- A card written with stage_id gets the matching stage name, and a card written with only a
-- stage name (the code on main, the seed scripts) gets the matching stage_id. When both change,
-- stage_id decides. A column added later that is not a default has no stage name of its own:
-- the name of its kind for hired and rejected, and 'new' for an open one.
--
-- security definer so it finds the column whoever writes the card, but only among the columns of
-- the card's customer, which the trigger before it set from the job. A column of another customer
-- is stage_not_found, the same as one that does not exist.
-- Runs after applications_set_customer: Postgres fires triggers in name order.
create or replace function public.sync_application_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    if new.stage is not distinct from old.stage then
      return new;
    end if;
    new.stage_id := null;
  end if;

  if new.stage_id is null then
    new.stage_id := public.stage_id_for_key(new.customer_id, new.stage);
    if new.stage_id is null then
      raise exception 'stage_not_found';
    end if;
    return new;
  end if;

  select coalesce(s.default_key, case when s.kind in ('hired', 'rejected') then s.kind end, 'new')
  into new.stage
  from public.pipeline_stages s
  where s.id = new.stage_id and s.customer_id = new.customer_id;
  if not found then
    raise exception 'stage_not_found';
  end if;
  return new;
end;
$$;

create trigger applications_sync_stage
  before insert or update of stage, stage_id on public.applications
  for each row execute function public.sync_application_stage();

-- stage_changed_at follows either column. A move between two open columns that are not defaults
-- changes stage_id only. Named so it runs after applications_sync_stage has set both.
create or replace function public.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id or new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists applications_stage_changed on public.applications;
create trigger applications_touch_stage_changed
  before update of stage, stage_id on public.applications
  for each row execute function public.touch_stage_changed_at();

-- -----------------------------------------------------------------------------
-- 7. Row Level Security and grants
--
-- The same rule as jobs and candidates: the customer owns its columns while its account is
-- active, and an admin can do everything. Column grants keep id, customer_id and default_key
-- out of a client's updates, and default_key out of its inserts: only the defaults have one.
-- -----------------------------------------------------------------------------
alter table public.pipeline_stages enable row level security;

create policy "pipeline_stages_owner_or_admin" on public.pipeline_stages
  for all
  using ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()))
  with check ((customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin()));

grant select, delete on public.pipeline_stages to authenticated;
grant insert (customer_id, name, position, kind, colour) on public.pipeline_stages to authenticated;
grant update (name, position, kind, colour) on public.pipeline_stages to authenticated;
grant all on public.pipeline_stages to service_role;

-- -----------------------------------------------------------------------------
-- 8. Moving a card and reordering columns, by stage id
--
-- security invoker, like move_application before: RLS decides which cards and columns the caller
-- can see, and the customer id narrows it for admins to the active customer.
-- -----------------------------------------------------------------------------
create or replace function public.move_application(
  application_id uuid,
  customer_id uuid,
  new_stage_id uuid
)
returns public.applications
language plpgsql
security invoker
set search_path = public
as $$
declare
  moved public.applications;
begin
  if not exists (
    select 1 from public.applications a
    where a.id = move_application.application_id
      and a.customer_id = move_application.customer_id
  ) then
    raise exception 'card_not_found';
  end if;

  if not exists (
    select 1 from public.pipeline_stages s
    where s.id = move_application.new_stage_id
      and s.customer_id = move_application.customer_id
  ) then
    raise exception 'stage_not_found';
  end if;

  -- The customer's lock (section 2). The update below takes its snapshot after it, so it sees
  -- every move that committed before.
  perform pg_advisory_xact_lock(hashtextextended('pipeline_stages:' || move_application.customer_id, 0));

  update public.applications a
  set stage_id = move_application.new_stage_id,
      position = coalesce(
        (
          select max(b.position) from public.applications b
          where b.customer_id = move_application.customer_id
            and b.stage_id = move_application.new_stage_id
            and b.id <> a.id
        ),
        -1
      ) + 1
  where a.id = move_application.application_id
    and a.customer_id = move_application.customer_id
  returning a.* into moved;

  -- Deleted, or moved to another customer, between the check and the update.
  if moved.id is null then
    raise exception 'card_not_found';
  end if;

  return moved;
end;
$$;

revoke execute on function public.move_application(uuid, uuid, uuid) from public, anon;
grant execute on function public.move_application(uuid, uuid, uuid) to authenticated;

-- The version the code on main calls, by stage name. It moves through the one above, so both
-- take the same lock and number the same column. Removed with stage in ATS-42.
create or replace function public.move_application(
  application_id uuid,
  customer_id uuid,
  new_stage text
)
returns public.applications
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.applications a
    where a.id = move_application.application_id
      and a.customer_id = move_application.customer_id
  ) then
    raise exception 'card_not_found';
  end if;

  return public.move_application(
    move_application.application_id,
    move_application.customer_id,
    public.stage_id_for_key(move_application.customer_id, new_stage)
  );
end;
$$;

-- Puts a customer's columns in the given order: stage_ids must name each of its columns once.
-- One statement under the customer's lock, so two tabs reordering at once cannot interleave.
-- Returns the columns in their new order.
create or replace function public.reorder_stages(customer_id uuid, stage_ids uuid[])
returns setof public.pipeline_stages
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('pipeline_stages:' || reorder_stages.customer_id, 0));

  if exists (
    select 1 from unnest(stage_ids) as given(id)
    where given.id is null or not exists (
      select 1 from public.pipeline_stages s
      where s.id = given.id and s.customer_id = reorder_stages.customer_id
    )
  ) or coalesce(cardinality(stage_ids), 0) = 0 then
    raise exception 'stage_not_found';
  end if;

  if cardinality(stage_ids) <> (select count(distinct id) from unnest(stage_ids) as given(id))
     or cardinality(stage_ids) <> (
       select count(*) from public.pipeline_stages s where s.customer_id = reorder_stages.customer_id
     ) then
    raise exception 'invalid_input';
  end if;

  update public.pipeline_stages s
  set position = given.ordinality - 1
  from unnest(stage_ids) with ordinality as given(id, ordinality)
  where s.id = given.id
    and s.customer_id = reorder_stages.customer_id
    and s.position is distinct from given.ordinality - 1;

  return query
    select * from public.pipeline_stages s
    where s.customer_id = reorder_stages.customer_id
    order by s.position;
end;
$$;

revoke execute on function public.reorder_stages(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_stages(uuid, uuid[]) to authenticated;
