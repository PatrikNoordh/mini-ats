-- =============================================================================
-- The audit log: who created, changed or deleted a job, a candidate or a card, and when (ATS-47)
--
-- Written by the database, so no client and no Edge Function can skip or forge it:
--
--   * audit_events gets one row per insert, update and delete on jobs, candidates and
--     applications, from AFTER triggers, so it holds the values the BEFORE triggers settled
--     (a card's customer_id and first column).
--   * The event's customer is the row's customer_id, which never changes once written (ATS-61
--     AC1), so a row's whole history stays with one company.
--   * The actor is auth.uid(), read in the trigger, never a value a client sends. It is null when
--     the service role or the database itself writes (the demo seed, a cascade from a purge).
--   * The log is append-only: authenticated and the service role may only read it, and only the
--     trigger function, security definer, writes. RLS gives each company its own events, and an
--     admin every event.
--
-- What an event holds, kept small and free of personal data:
--
--   * fields: on an update, the columns that changed, in a fixed order. An update that changes
--     none of them (a card reordered within its column, updated_at alone) writes no event.
--   * before and after: the old and the new values of the columns that are not personal and not
--     long. A job keeps its title, location and status (its description is named in fields, never
--     copied); a card keeps its job, candidate and column ids. A candidate keeps no values at
--     all, only the names of the fields that changed, so editing or deleting a candidate really
--     removes its personal data.
--
-- No foreign key except customer_id: row_id and actor_id are plain ids, so a deleted row or a
-- purged user never removes or blocks an event (login_swap_blockers(), checks 51 and 58). A
-- candidate's delete is logged, and its events stay until its company is purged. customer_id
-- references companies on delete cascade, so a company purge takes its log with it. The trigger
-- writes nothing for a row whose company is gone, as check_pipeline_stage_kinds() does: in a
-- company delete, the company row goes first and its rows cascade after, and an event for them
-- would reference a company that no longer exists.
--
-- Backwards compatible with the code on main: it adds a table and AFTER triggers, which change no
-- row and raise no error of their own. History starts with this migration; nothing is backfilled.
-- ATS-48 shows the history and resolves names when it does, since the log stores none.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The table
-- -----------------------------------------------------------------------------
create table public.audit_events (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references public.companies (id) on delete cascade,
  actor_id    uuid,
  action      text not null check (action in ('insert', 'update', 'delete')),
  table_name  text not null check (table_name in ('jobs', 'candidates', 'applications')),
  row_id      uuid not null,
  fields      text[],
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now(),
  constraint audit_events_fields_on_update check ((action = 'update') = (fields is not null))
);

comment on table public.audit_events is
  'Who created, changed or deleted a job, candidate or card. Written only by write_audit_event() (ATS-47).';

-- A company's events newest first, and one row's events (ATS-48).
create index audit_events_customer_idx on public.audit_events (customer_id, id desc);
create index audit_events_row_idx on public.audit_events (row_id);

-- -----------------------------------------------------------------------------
-- 2. Who may read it, and that nobody but the trigger writes
-- -----------------------------------------------------------------------------
alter table public.audit_events enable row level security;

create policy audit_events_owner_or_admin on public.audit_events
  for select to authenticated
  using (customer_id = (select public.current_company_id()) or (select public.is_admin()));

revoke all on public.audit_events from public, anon, authenticated, service_role;
grant select on public.audit_events to authenticated, service_role;
revoke all on sequence public.audit_events_id_seq from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. The trigger
--
-- tracked: the columns whose change is an event. kept: the ones whose values the event copies.
-- id, customer_id (never changes), created_at, updated_at, a card's position and
-- stage_changed_at, and a candidate's cv_uploaded_at are bookkeeping and never an event.
-- -----------------------------------------------------------------------------
create or replace function public.write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_data jsonb := coalesce(new_row, old_row);
  tracked text[];
  kept text[];
  changed text[];
begin
  case tg_table_name
    when 'jobs' then
      tracked := array['title', 'description', 'location', 'status'];
      kept := array['title', 'location', 'status'];
    when 'candidates' then
      tracked := array['full_name', 'email', 'phone', 'linkedin_url', 'notes', 'cv_path'];
      kept := array[]::text[];
    when 'applications' then
      tracked := array['job_id', 'candidate_id', 'stage_id'];
      kept := tracked;
  end case;

  if tg_op = 'UPDATE' then
    select array_agg(f order by n) into changed
    from unnest(tracked) with ordinality as t (f, n)
    where old_row -> f is distinct from new_row -> f;
    if changed is null then
      return null;
    end if;
  end if;

  if not exists (select 1 from public.companies c where c.id = (row_data ->> 'customer_id')::uuid) then
    return null;
  end if;

  insert into public.audit_events (customer_id, actor_id, action, table_name, row_id, fields, before, after)
  values (
    (row_data ->> 'customer_id')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (row_data ->> 'id')::uuid,
    changed,
    (select jsonb_object_agg(k, old_row -> k) from unnest(kept) k where old_row is not null),
    (select jsonb_object_agg(k, new_row -> k) from unnest(kept) k where new_row is not null)
  );
  return null;
end;
$$;

revoke execute on function public.write_audit_event() from public, anon, authenticated, service_role;

create trigger jobs_audit
  after insert or update or delete on public.jobs
  for each row execute function public.write_audit_event();

create trigger candidates_audit
  after insert or update or delete on public.candidates
  for each row execute function public.write_audit_event();

create trigger applications_audit
  after insert or update or delete on public.applications
  for each row execute function public.write_audit_event();
