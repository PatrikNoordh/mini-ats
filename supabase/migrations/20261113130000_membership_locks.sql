-- =============================================================================
-- A membership waits for the account's role and the company's delete (ATS-61, AC7)
--
-- The admin writes that span several steps race in two ways, both through company_members:
--
--   * A membership written while the same account is promoted to admin could leave an admin as a
--     member. check_company_member() read the role before the promotion committed, and the
--     promotion's trigger (profiles_sync_company) deleted the memberships before the new one
--     committed, so neither saw the other.
--   * A user added to a company while it is being deleted could miss the ban. admin-manage-company
--     marks the company deleted, then reads its members and bans each login. A membership that
--     committed after that read was never banned.
--
-- One design for both, in the one place every membership write passes: check_company_member()
-- locks the account's profile row and the company's row (FOR SHARE) before it checks them. The
-- promotion and the delete update those rows, so they wait for a membership being written, and a
-- membership waits for them. Whichever commits second sees the first: the promotion removes a
-- membership that committed before it, a membership is refused for an admin, a company deleted
-- before it is refused with company_deleted, and the delete reads a membership that committed
-- before its mark and bans it. The Edge Functions write the membership before they lift a ban or
-- after they create the login, so a ban made by the delete is never lifted by them afterwards.
-- supabase/tests/membership_concurrency.sh runs both races.
--
-- Backwards compatible with the code on main: it never adds a member to a deleted company (the
-- functions check that first), and the refusal it may now get in a race is reported as an error.
--
-- Error codes (docs/error-codes.md): admin_cannot_be_member as before, and company_deleted.
-- =============================================================================

create or replace function public.check_company_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role text;
  company_deleted_at timestamptz;
begin
  -- Profile first, then company. Nothing else locks both, so the order cannot deadlock.
  select p.role into member_role from public.profiles p where p.id = new.user_id for share;
  if member_role = 'admin' then
    raise exception 'admin_cannot_be_member';
  end if;

  select c.deleted_at into company_deleted_at from public.companies c where c.id = new.company_id for share;
  if company_deleted_at is not null then
    raise exception 'company_deleted';
  end if;
  return new;
end;
$$;
