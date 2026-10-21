-- =============================================================================
-- Move a card to a stage in one database call (ATS-12, AC6)
--
-- The app used to read the last position in the column and then write the card in a second
-- request, so two quick moves into the same column could get the same position. This function
-- does both in one transaction, and a lock per customer and column makes concurrent moves into
-- the same column wait for each other, so each one sees the position the previous one took.
--
-- security invoker: it runs with the caller's rights, so RLS decides which cards the caller can
-- move, exactly as for a plain update. The customer id narrows it further for admins, the same
-- way every app query is scoped to the active customer. A card the caller cannot see, or that
-- belongs to another customer, raises card_not_found (docs/error-codes.md).
-- The existing triggers still set stage_changed_at and updated_at.
-- =============================================================================
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

  -- Held until the transaction ends. The update below takes its snapshot after the lock, so it
  -- sees every move into this column that committed before.
  perform pg_advisory_xact_lock(
    hashtextextended('applications.position:' || move_application.customer_id || ':' || new_stage, 0)
  );

  update public.applications a
  set stage = new_stage,
      position = coalesce(
        (
          select max(b.position) from public.applications b
          where b.customer_id = move_application.customer_id
            and b.stage = new_stage
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

revoke execute on function public.move_application(uuid, uuid, text) from public, anon;
grant execute on function public.move_application(uuid, uuid, text) to authenticated;
