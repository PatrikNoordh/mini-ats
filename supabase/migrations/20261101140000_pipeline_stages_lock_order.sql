-- =============================================================================
-- Writes to a column no longer wait for the customer's lock while holding the row (ATS-38, PR #101)
--
-- 20261101120000_pipeline_stages took the customer's advisory lock in a before-row trigger on
-- every insert, update and delete of pipeline_stages. Postgres locks the row before a before-row
-- trigger on update or delete runs, so a rename or a removal held its column and then waited for
-- the customer's lock. A move_application or reorder_stages that already held that lock and then
-- needed the same column (the foreign key check of a move, the position update of a reorder)
-- waited for the row: a deadlock, and Postgres cancelled one of the two (40P01).
--
-- The locks now never wait on each other in a circle:
--
--   * The customer's lock (moves, reorder_stages, inserts) is taken only where the transaction
--     holds no column row yet: by the functions before they write, and by an insert, whose new
--     row no one else can see.
--   * A rename, a new position or a new colour takes no advisory lock. The row lock is enough:
--     a reorder waits for it, and a move's foreign key check does not conflict with it.
--   * A removal or a change of kind takes a second lock per customer, used for nothing else, so
--     two of them cannot each leave the other's hired or rejected column as the last one. Only
--     another removal or change of kind waits for it, and that one holds no row the first needs.
--   * A move into a column that is being removed waits for the removal. Once it commits, the
--     move fails on the foreign key (23503) instead of pointing at a removed column.
--
-- A single statement that removes several columns at once can still deadlock with another such
-- statement. The app removes one column per request.
--
-- Backwards compatible: the functions, tables and grants keep their shape.
-- =============================================================================

create or replace function public.pipeline_stages_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('pipeline_stages:' || new.customer_id, 0));
    -- Taken after the lock, so it sees every insert that committed before.
    if (select count(*) from public.pipeline_stages s where s.customer_id = new.customer_id) >= 10 then
      raise exception 'stage_limit_reached';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(hashtextextended('pipeline_stages.kinds:' || old.customer_id, 0));
    return old;
  end if;

  if new.kind is distinct from old.kind then
    perform pg_advisory_xact_lock(hashtextextended('pipeline_stages.kinds:' || old.customer_id, 0));
  end if;
  return new;
end;
$$;
