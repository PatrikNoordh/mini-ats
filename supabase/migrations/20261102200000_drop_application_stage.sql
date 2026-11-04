-- =============================================================================
-- applications.stage is gone; stage_id is the only column a card has (ATS-42)
--
-- Since ATS-39 no code on main reads or writes applications.stage. This drops it with its check,
-- and everything that kept it in step with stage_id (ATS-38):
--
--   * the trigger applications_sync_stage and its function,
--   * move_application(uuid, uuid, text), the version by stage name,
--   * stage_id_for_key, which only those two used.
--
-- stage_id becomes `not null`, replacing the check applications_stage_id_set. It gets a placeholder
-- default, the nil UUID, which no column can have (gen_random_uuid never returns it), so a card can
-- still be inserted without naming a column: the generated Insert type keeps stage_id optional,
-- and the trigger applications_start_stage puts the card in the customer's first open column,
-- as the sync trigger did since ATS-40. The same pattern as applications.customer_id's
-- `default auth.uid()`, which the trigger before it always replaces. A stage_id the client does
-- name must be one of the card's own customer's columns: the foreign key on
-- (stage_id, customer_id) refuses any other (23503).
--
-- NOT backwards compatible with v1.0-submission, which reads and writes stage. That is the point
-- of this ticket: the submission URL is retired, and the tag and release v1.0-submission keep the
-- submitted code. The code on main does not use stage.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Out with the sync between stage and stage_id
-- -----------------------------------------------------------------------------
drop trigger if exists applications_sync_stage on public.applications;
drop function if exists public.sync_application_stage();
drop function if exists public.move_application(uuid, uuid, text);
drop function if exists public.stage_id_for_key(uuid, text);

-- stage_changed_at follows stage_id alone.
create or replace function public.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists applications_touch_stage_changed on public.applications;
create trigger applications_touch_stage_changed
  before update of stage_id on public.applications
  for each row execute function public.touch_stage_changed_at();

-- Drops its check and the index on (customer_id, stage, position) with it.
alter table public.applications drop column stage;

-- -----------------------------------------------------------------------------
-- 2. A new card without a column lands in the first open column
--
-- security definer so it finds the column whoever inserts the card, but only among the card's own
-- customer's columns, which applications_set_customer set from the job. Postgres fires triggers
-- in name order, and applications_set_customer comes before applications_start_stage.
-- -----------------------------------------------------------------------------
create or replace function public.set_application_start_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is null or new.stage_id = '00000000-0000-0000-0000-000000000000'::uuid then
    select s.id into new.stage_id
    from public.pipeline_stages s
    where s.customer_id = new.customer_id and s.kind = 'open'
    order by s.position
    limit 1;
    if new.stage_id is null then
      raise exception 'stage_not_found';
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_start_stage
  before insert on public.applications
  for each row execute function public.set_application_start_stage();

alter table public.applications
  alter column stage_id set default '00000000-0000-0000-0000-000000000000'::uuid,
  alter column stage_id set not null,
  drop constraint applications_stage_id_set;
