-- =============================================================================
-- Reading the audit log: a candidate's history, an account's actions and the actors' names (ATS-48)
--
-- ATS-47 writes the log; this migration lets the app read it the three ways ATS-48 shows it:
--
--   * A candidate's history is its own events and its cards'. A card event names its candidate
--     only inside before/after, so candidate_id, a generated column, lifts it out: the row's id
--     for a candidate event, the card's candidate for a card event, null for a job. It is
--     generated from the row, so no trigger and no client sets it, and it is indexed.
--   * An admin reads one account's actions in every company (AC2), by actor_id, also indexed.
--   * The log stores no names (ATS-47). A customer can read only their own profile, so
--     audit_actor_names() gives the names of the actors in the caller's own company's events:
--     a member's, a former member's who acted there, and for an admin only that it was an admin,
--     never the admin's name. An admin gets every name. A purged user has no profile and comes
--     back as nothing, which the app shows as a removed user. Asking for anyone else (a user who
--     never acted in the caller's company) returns nothing, so the function cannot be used to
--     look up names.
--
-- Backwards compatible with the code on main: a new column with no default to send, two indexes
-- and a new function. Nothing on main reads audit_events.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The candidate an event concerns, and the indexes the two histories read by
-- -----------------------------------------------------------------------------
alter table public.audit_events
  add column candidate_id uuid generated always as (
    case table_name
      when 'candidates' then row_id
      when 'applications' then (coalesce(after, before) ->> 'candidate_id')::uuid
    end
  ) stored;

comment on column public.audit_events.candidate_id is
  'The candidate the event concerns: the row for a candidate, the card''s candidate for a card, null for a job (ATS-48).';

create index audit_events_candidate_idx on public.audit_events (candidate_id, id desc)
  where candidate_id is not null;
create index audit_events_actor_idx on public.audit_events (actor_id, id desc)
  where actor_id is not null;

-- -----------------------------------------------------------------------------
-- 2. The actors' names
-- -----------------------------------------------------------------------------
create or replace function public.audit_actor_names(actor_ids uuid[])
returns table (id uuid, full_name text, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    case when p.role = 'admin' and not public.is_admin() then null else p.full_name end,
    p.role = 'admin'
  from public.profiles p
  where p.id = any (actor_ids)
    and (
      public.is_admin()
      or exists (
        select 1 from public.audit_events e
        where e.actor_id = p.id and e.customer_id = public.current_company_id()
      )
    );
$$;

revoke execute on function public.audit_actor_names(uuid[]) from public, anon;
grant execute on function public.audit_actor_names(uuid[]) to authenticated, service_role;
