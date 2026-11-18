-- =============================================================================
-- Name the user reference check after what it guards (ATS-63 AC5)
--
-- login_swap_blockers() was the login swap's safety check (ATS-58). The swap is retired (ATS-61),
-- and the function stayed as the guard that no customer table, and not companies, references a
-- user, so deleting a login never reaches company data (rls_test.sql checks 51 and 58). It is
-- renamed after that guard. The body, the read-only rule and the grants stay as they are: only
-- the service role may run it.
--
-- Backwards compatible with the code on main: no app code, Edge Function or script calls it; only
-- rls_test.sql does, and that runs against the branch's migrations.
-- =============================================================================

alter function public.login_swap_blockers() rename to company_data_user_references;

comment on function public.company_data_user_references() is
  'Each foreign key from a customer table or companies to a user. Empty, so a login delete keeps company data.';
