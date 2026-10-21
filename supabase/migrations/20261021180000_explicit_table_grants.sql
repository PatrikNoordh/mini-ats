-- =============================================================================
-- Explicit table grants instead of Supabase's default privileges (ATS-22)
--
-- Supabase grants anon and authenticated every privilege on every table in public, and RLS
-- alone decides what they can do. RLS stays the protection; these grants are a second layer,
-- so a table that ever loses or misses a policy is not open to everyone.
--
--   * anon (signed out) gets nothing: the app reads no data before login.
--   * authenticated gets only what the app does on each table, through RLS as before.
--   * service_role keeps everything (admin-create-user, assess-cv). Granted explicitly so a
--     plain Postgres (CI) has the same privileges as the project.
--
-- Not needed by authenticated, so not granted:
--   * profiles insert/update: the handle_new_user trigger (security definer) creates the row,
--     and no screen edits a profile.
--   * applications delete: a candidate's cards go through the foreign key cascade, which runs
--     as the table owner.
--   * cv_assessments writes: only assess-cv writes, with the service role (security rule 8).
--
-- Function execute grants are unchanged (move_application is granted in its own migration).
-- A table added later starts with no grants for anon and authenticated, and its migration
-- grants what it needs.
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;

grant select                         on public.profiles       to authenticated;
grant select, insert, update, delete on public.jobs           to authenticated;
grant select, insert, update, delete on public.candidates     to authenticated;
grant select, insert, update         on public.applications   to authenticated;
grant select                         on public.cv_assessments to authenticated;

grant all on all tables in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
