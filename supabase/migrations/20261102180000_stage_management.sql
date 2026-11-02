-- =============================================================================
-- Adding columns, resetting to the defaults, and where a new card lands (ATS-40)
--
--   * add_stage puts a new open column just before the first Hired or Rejected column, so a new
--     step never lands after the end of the pipeline.
--   * reset_stages brings back the six default columns with their names, colours, kinds and
--     order. It keeps the default columns' ids, so their cards stay where they are, and refuses
--     with 23503 (foreign_key_violation), changing nothing, while a column it would remove still
--     has cards.
--   * Every customer keeps at least one open column (stage_open_required), and a new card
--     inserted without a column lands in the first open column by position, never in Hired or
--     Rejected, whatever the columns are called or however they are ordered.
--
-- Locks: both functions take the customer's lock first, then the rows they change, and the
-- removal lock (pipeline_stages.kinds) last. A plain removal holds its row and then waits for the
-- removal lock, so taking the rows before that lock means the two never wait on each other in a
-- circle (20261101140000_pipeline_stages_lock_order).
--
-- Backwards compatible: new functions, and a card inserted with the stage name 'new', as the code
-- on main and v1.0-submission do, still lands in the first column for a board that was never
-- changed. The kind rule only adds a refusal no code on main can reach.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The six defaults in one place, for new accounts and for a reset
-- -----------------------------------------------------------------------------
create or replace function public.default_stage_specs()
returns table (default_key text, "position" integer, kind text, colour text)
language sql
immutable
set search_path = public
as $$
  values
    ('new',       0, 'open',     'grey'),
    ('screening', 1, 'open',     'blue'),
    ('interview', 2, 'open',     'violet'),
    ('offer',     3, 'open',     'amber'),
    ('hired',     4, 'hired',    'green'),
    ('rejected',  5, 'rejected', 'red');
$$;

create or replace function public.create_default_stages(customer uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pipeline_stages (customer_id, default_key, position, kind, colour)
  select customer, d.default_key, d.position, d.kind, d.colour from public.default_stage_specs() d;
$$;

-- -----------------------------------------------------------------------------
-- 2. At least one open column, so a new card always has somewhere to go
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
  if not exists (
    select 1 from public.pipeline_stages s where s.customer_id = old.customer_id and s.kind = 'open'
  ) then
    raise exception 'stage_open_required';
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. A new card lands in the first open column
--
-- The same function as in 20261101120000_pipeline_stages, except for an insert that names no
-- column and keeps the default stage name 'new': the app on main, v1.0-submission and the
-- candidate dialog all insert that way. It now goes to the customer's first open column by
-- position, so it still works after New is renamed, removed or moved.
-- -----------------------------------------------------------------------------
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

  if tg_op = 'INSERT' and new.stage_id is null and new.stage = 'new' then
    select s.id into new.stage_id
    from public.pipeline_stages s
    where s.customer_id = new.customer_id and s.kind = 'open'
    order by s.position
    limit 1;
  elsif new.stage_id is null then
    new.stage_id := public.stage_id_for_key(new.customer_id, new.stage);
  end if;
  if new.stage_id is null then
    raise exception 'stage_not_found';
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

-- -----------------------------------------------------------------------------
-- 4. add_stage: a new open column before the first Hired or Rejected column
--
-- security invoker: RLS decides, as for any insert, and the column grants keep default_key out.
-- A customer the caller cannot see is stage_not_found. The name and colour checks, the name's
-- uniqueness and the 10-column limit are the table's own.
-- -----------------------------------------------------------------------------
create or replace function public.add_stage(customer_id uuid, name text, colour text)
returns public.pipeline_stages
language plpgsql
security invoker
set search_path = public
as $$
declare
  target integer;
  added public.pipeline_stages;
begin
  perform pg_advisory_xact_lock(hashtextextended('pipeline_stages:' || add_stage.customer_id, 0));

  if not exists (select 1 from public.pipeline_stages s where s.customer_id = add_stage.customer_id) then
    raise exception 'stage_not_found';
  end if;

  select coalesce(
    min(s.position) filter (where s.kind <> 'open'),
    max(s.position) + 1
  ) into target
  from public.pipeline_stages s
  where s.customer_id = add_stage.customer_id;

  set constraints pipeline_stages_position_key deferred;
  update public.pipeline_stages s
  set position = s.position + 1
  where s.customer_id = add_stage.customer_id and s.position >= target;

  insert into public.pipeline_stages (customer_id, name, position, kind, colour)
  values (add_stage.customer_id, add_stage.name, target, 'open', add_stage.colour)
  returning * into added;
  set constraints pipeline_stages_position_key immediate;

  return added;
end;
$$;

revoke execute on function public.add_stage(uuid, text, text) from public, anon;
grant execute on function public.add_stage(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. reset_stages: the six default columns again
--
-- security definer, because a removed default comes back with its default_key, which clients
-- may not insert. So it checks the caller itself, with the same rule as the table's policy, and
-- answers stage_not_found for a customer the caller may not change.
--
-- In order: the columns that are not defaults go first, so the 10-column limit never trips; the
-- defaults that are left get their names, colours, kinds and positions back in place, keeping
-- their ids and so their cards; the missing defaults are inserted. The kind and position checks
-- run once, at the end. A removed column with cards fails the foreign key (23503), and the whole
-- call changes nothing.
-- -----------------------------------------------------------------------------
create or replace function public.reset_stages(customer_id uuid)
returns setof public.pipeline_stages
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    (reset_stages.customer_id = auth.uid() and public.account_is_active()) or public.is_admin()
  ) or not exists (select 1 from public.profiles p where p.id = reset_stages.customer_id) then
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

revoke execute on function public.reset_stages(uuid) from public, anon;
grant execute on function public.reset_stages(uuid) to authenticated;

revoke execute on function public.default_stage_specs() from public, anon, authenticated;
